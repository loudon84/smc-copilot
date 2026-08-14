from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
FORBIDDEN = ("services.runtime", "services.salt-control", "salt_control", "smc-salt-control")


def test_no_runtime_or_salt_imports():
    offenders: list[str] = []
    for path in ROOT.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        for needle in FORBIDDEN:
            if needle in text:
                offenders.append(f"{path}: {needle}")
        if "from salt" in text or "import salt" in text:
            offenders.append(f"{path}: salt import")
    assert offenders == []
