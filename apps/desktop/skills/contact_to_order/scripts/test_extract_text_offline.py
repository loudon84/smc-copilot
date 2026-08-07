#!/usr/bin/env python3
"""Offline tests for contact_to_order extract_text (no Ollama).

Run:
  python scripts/test_extract_text_offline.py
  python scripts/test_extract_text_offline.py --pdf "C:/path/to/contract.pdf"
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parent.parent
EXTRACT_SCRIPT = SKILL_ROOT / "scripts" / "extract_text.py"
SAMPLE_ORDER = [
    {
        "custname": "杭州华尧科技有限公司",
        "orderno": "2025032602-LX",
        "supname": "深圳市芯云信息科技有限公司",
        "deliverydate": "2025-03-30",
        "partno": "SSC377DE",
        "partdesc": "芯片",
        "quantity": 1216,
        "price": "85.000000",
        "amount": "102680.000000",
    },
]
CALLBACK = (
    "http://192.168.99.35:8080/sdms/om/sdms_om_main/sdmsOmMain.do"
    "?method=addSoDesktop&tempType="
)


def load_module():
    spec = importlib.util.spec_from_file_location("extract_text", EXTRACT_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {EXTRACT_SCRIPT}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def ok(name: str) -> None:
    print(f"  OK  {name}")


def fail(name: str, detail: str) -> None:
    print(f"  FAIL {name}: {detail}")
    raise AssertionError(f"{name}: {detail}")


def test_classify_and_callback(mod) -> None:
    assert mod.classify_file(Path("a.pdf")) == "document"
    assert mod.classify_file(Path("b.png")) == "image"
    base = mod.validate_callback_url(CALLBACK)
    assert "tempType=" in base or "addSoDesktop" in base
    url = mod.build_web_url(CALLBACK, SAMPLE_ORDER)
    assert url.startswith("http://192.168.99.35")
    assert "tempType=" in url
    assert "&amp;" not in url
    ok("classify + build_web_url")


def test_normalize_sample(mod) -> None:
    raw = json.dumps({"orderinfo": SAMPLE_ORDER}, ensure_ascii=False)
    out = mod.normalize_model_output(raw)
    rows = out.get("orderinfo") or []
    if not rows or rows[0].get("partno") != "SSC377DE":
        fail("normalize_model_output", str(out))
    ok("normalize_model_output")


def test_persist_web_url(mod) -> None:
    url = mod.build_web_url(CALLBACK, SAMPLE_ORDER)
    path, mtime = mod.persist_web_url_file(url)
    p = Path(path)
    if not p.is_file() or p.read_text(encoding="utf-8") != url:
        fail("persist_web_url_file", path)
    if not mtime:
        fail("persist_web_url_file mtime", "empty")
    ok("persist_web_url_file")


def test_apply_callback_payload(mod) -> None:
    payload: dict = {"ok": True, "orderinfo": SAMPLE_ORDER}
    mod.apply_callback(payload, CALLBACK)
    if not payload.get("callback_applied"):
        fail("apply_callback", payload.get("callback_error", payload))
    if not payload.get("web_url_file_updated"):
        fail("web_url_file_updated", str(payload))
    ok("apply_callback")


def test_render_pdf_pages(mod, pdf: Path | None) -> None:
    if pdf is None or not pdf.is_file():
        print("  SKIP render_pdf_pages (pass --pdf for integration)")
        return
    try:
        pages = mod.render_pdf_pages(pdf, max_pages=2)
    except Exception as exc:  # noqa: BLE001
        fail("render_pdf_pages", str(exc))
    if not pages or not all(p.is_file() for p in pages):
        fail("render_pdf_pages", f"no png pages: {pages}")
    ok(f"render_pdf_pages ({len(pages)} page(s))")


def test_extract_only_cli(pdf: Path | None) -> None:
    if pdf is None or not pdf.is_file():
        print("  SKIP extract-only CLI (pass --pdf)")
        return
    import subprocess

    proc = subprocess.run(
        [sys.executable, str(EXTRACT_SCRIPT), str(pdf), "--extract-only"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=120,
    )
    if proc.returncode != 0:
        fail("extract-only exit", proc.stderr or proc.stdout)
    data = json.loads(proc.stdout)
    if not data.get("ok"):
        fail("extract-only ok", proc.stdout[:500])
    ok("CLI --extract-only")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", default=None, help="Optional PDF for render/extract-only tests")
    args = parser.parse_args()
    pdf = Path(args.pdf).expanduser().resolve() if args.pdf else None

    print(f"SKILL_ROOT={SKILL_ROOT}")
    mod = load_module()
    tests = [
        lambda: test_classify_and_callback(mod),
        lambda: test_normalize_sample(mod),
        lambda: test_persist_web_url(mod),
        lambda: test_apply_callback_payload(mod),
        lambda: test_render_pdf_pages(mod, pdf),
        lambda: test_extract_only_cli(pdf),
    ]
    failed = 0
    for t in tests:
        try:
            t()
        except AssertionError:
            failed += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  FAIL {t.__name__}: {exc}")
            failed += 1
    print()
    if failed:
        print(f"FAILED ({failed} test group(s))")
        return 1
    print("All runnable tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
