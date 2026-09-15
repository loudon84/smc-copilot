#!/usr/bin/env python3
"""Create smc.plan.v3.7 seed from the current v3.6 seed generator."""
from __future__ import annotations

import argparse
import importlib.util
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
V36 = HERE / "create_plan_seed_v36.py"
RUNTIME = HERE.parents[3] / "domain-runtime"
if not RUNTIME.is_dir():
    RUNTIME = HERE.parents[3] / ".agents" / "ges" / "domain-runtime"
sys.path.insert(0, str(RUNTIME))
from risk_signals import parse_routing_facts, snapshot_json  # noqa: E402
from domain_intent import (  # noqa: E402
    activation_digest,
    binding_table,
    build_bindings,
    canonical_empty_binding,
    aggregate_intent_digest,
    source_prd_sha256,
)
from domain_runtime import load_context  # noqa: E402


LEAN_OMIT_SECTIONS = (
    "Lifecycle Closure Matrix",
    "Contract / Data Flow Closure Matrix",
    "Acceptance Claim Ledger",
    "Live Scenario Matrix",
    "Live Environment Matrix",
)


def fm(text):
    out = {}
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return out
    for line in lines[1:]:
        if line.strip() == "---":
            break
        if line and not line[0].isspace() and ":" in line:
            k, v = line.split(":", 1)
            out[k.strip()] = v.strip().strip("\"'")
    return out


def _omit_sections(text: str, headings: tuple[str, ...]) -> str:
    """Remove named ## sections from a plan (LEAN compact contract)."""
    import re as _re

    for heading in headings:
        text = _re.sub(
            rf"^##\s+{_re.escape(heading)}\s*$.*?(?=^##\s+|\Z)",
            "",
            text,
            count=1,
            flags=_re.M | _re.S,
        )
    # Collapse excess blank lines
    text = _re.sub(r"\n{3,}", "\n\n", text)
    return text


def _inject_lean_decisions(text: str) -> str:
    """Ensure LEAN compact decision sections exist."""
    extras = []
    if "## Existing Capability Decision" not in text:
        extras.append(
            "## Existing Capability Decision\n\n"
            "| Capability | Owner | Decision | Evidence |\n"
            "|---|---|---|---|\n"
            "| <GROUND> | <GROUND> | REUSE | <GROUND> |\n"
        )
    if "## UX Surface Decision" not in text:
        extras.append(
            "## UX Surface Decision\n\n"
            "| App ID | UX Role | Surface ID | Decision | Justification |\n"
            "|---|---|---|---|---|\n"
            "| <GROUND> | <GROUND> | <GROUND> | EXTEND | <GROUND> |\n"
        )
    if not extras:
        return text
    marker = "## Change Matrix"
    block = "\n".join(extras) + "\n"
    if marker in text:
        return text.replace(marker, block + marker, 1)
    return text + "\n" + block


def section(text, heading):
    m = re.search(rf"^##\s+{re.escape(heading)}\s*$\n?(.*?)(?=^##\s+|\Z)", text, re.M | re.S)
    return m.group(1).strip() if m else ""


def repo_root(path):
    for c in (path.resolve().parent, *path.resolve().parents):
        if (c / ".agents/ges/domain-runtime/domain_runtime.py").is_file():
            return c
    raise ValueError("DOMAIN_RUNTIME_MISSING")


def validate_preplan(prd):
    repo = repo_root(prd)
    target = repo / ".agents/ges/domain-runtime/domain_runtime.py"
    spec = importlib.util.spec_from_file_location("ges_domain_preplan", target)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if mod.load_context(repo)["profile"]["schema"] != "smc.ges.consumer-profile.v3":
        raise ValueError("V37_REQUIRES_PROFILE_V3: explicitly migrate profile or use v36 seed")
    return mod.validate_preplan(prd)


def insert_frontmatter(text, line):
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError("PLAN_FRONTMATTER_MISSING")
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            lines.insert(i, line)
            return "\n".join(lines) + "\n"
    raise ValueError("PLAN_FRONTMATTER_UNCLOSED")


def _set_fm(text: str, key: str, value: str) -> str:
    pattern = re.compile(rf"^{re.escape(key)}:\s*.*$", re.M)
    if pattern.search(text.split("---", 2)[1] if text.startswith("---") else ""):
        # replace inside frontmatter only
        parts = text.split("---", 2)
        parts[1] = pattern.sub(f"{key}: {value}", parts[1], count=1)
        return "---".join(parts)
    return insert_frontmatter(text, f"{key}: {value}")


def _binding_failed(phase: str, exc: BaseException) -> int:
    reason = str(exc).replace("\n", " ").strip()[:240]
    print(f"PLAN_SEED_BINDING_GENERATION_FAILED: phase={phase} reason={reason}", file=sys.stderr)
    return 2


def apply_bindings(text: str, prd: Path, profile: str, snapshot_line: str = "") -> str:
    # @lat: [[safety-runtime-closure-v503]]
    prd_sha = source_prd_sha256(prd)
    try:
        rel = prd.resolve().relative_to(repo_root(prd).resolve()).as_posix()
    except ValueError:
        rel = str(prd)
    text = _set_fm(text, "source_prd", rel)
    text = _set_fm(text, "source_prd_sha256", prd_sha)
    text = _set_fm(text, "domain_intent_binding_version", "1")
    try:
        ctx0 = load_context(repo_root(prd))
        packs = {k: v for k, v in ctx0["packs"].items()}
        digest = aggregate_intent_digest(prd, packs)
        empty = canonical_empty_binding()
        try:
            from domain_runtime import resolve as resolve_domains  # noqa: E402

            activation = resolve_domains(prd)
            act_digest = activation_digest(activation)
        except Exception:
            act_digest = empty["domain_activation_digest"]
        text = _set_fm(text, "domain_intent_digest", digest)
        text = _set_fm(text, "domain_activation_digest", act_digest)
        bindings = build_bindings(prd, packs)
        if not bindings:
            table = empty["binding_table"]
        else:
            table = binding_table(bindings)
    except Exception as exc:
        raise RuntimeError(f"digest:{exc}") from exc

    marker = "## Requirement Coverage Ledger"
    block = (
        f"## Governance Profile\n\n"
        f"- Profile: `{profile}`\n"
        f"- Route rationale: <GROUND>\n"
        f"- Escalation triggers checked: <GROUND>\n"
        f"{snapshot_line}\n"
    )
    if marker in text and "## Governance Profile" not in text:
        text = text.replace(marker, block + marker, 1)
    if "## Domain Intent Binding" not in text:
        if "## Governance Profile\n" in text:
            text = text.replace("## Governance Profile\n", table + "\n## Governance Profile\n", 1)
        else:
            text = text + "\n" + table
    return text


def repair_binding(plan: Path, prd: Path) -> int:
    text = plan.read_text(encoding="utf-8")
    meta = fm(text)
    if meta.get("plan_contract") != "smc.plan.v3.7":
        print("PLAN_REPAIR_REQUIRES_V37", file=sys.stderr)
        return 2
    profile = (meta.get("governance_profile") or "FULL").upper()
    try:
        text = apply_bindings(text, prd, profile)
    except Exception as exc:
        return _binding_failed("repair", exc)
    # Invalidate prior review/evidence markers in frontmatter if present.
    for stale_key in ("review_verdict", "evidence_verdict", "static_review_sha256", "semantic_review_sha256"):
        if stale_key in meta:
            text = _set_fm(text, stale_key, "STALE_PENDING_REBIND")
    plan.write_text(text, encoding="utf-8", newline="\n")
    print(f"Plan v3.7 binding repaired: {plan}")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prd", type=Path, nargs="?")
    ap.add_argument("output", type=Path, nargs="?")
    ap.add_argument("--plan-id")
    ap.add_argument("--governance-profile", choices=("LEAN", "FULL"))
    ap.add_argument("--repair-binding", nargs=2, metavar=("PLAN", "PRD"), help="re-bind existing v3.7 plan")
    a = ap.parse_args()
    if a.repair_binding:
        return repair_binding(Path(a.repair_binding[0]).resolve(), Path(a.repair_binding[1]).resolve())
    if not a.prd or not a.output or not a.plan_id:
        ap.error("prd, output, and --plan-id are required unless --repair-binding is used")
    out = a.output.resolve()
    if out.exists():
        print(f"PLAN_ALREADY_EXISTS: {out}", file=sys.stderr)
        return 2
    prd = a.prd.resolve()
    prd_text = prd.read_text(encoding="utf-8")
    meta = fm(prd_text)
    profile = (a.governance_profile or meta.get("governance_profile") or "FULL").upper()
    if profile not in {"LEAN", "FULL"}:
        print(f"PRD_GOVERNANCE_PROFILE_INVALID: {profile}", file=sys.stderr)
        return 2
    if meta.get("governance_profile", "").upper() == "FULL" and profile != "FULL":
        print("PRD_PROFILE_DOWNGRADE_FORBIDDEN", file=sys.stderr)
        return 2
    scanner = HERE.parents[1] / "smc-prd-grounding/scripts/prd_profile.py"
    checked = subprocess.run(
        [sys.executable, str(scanner), "scan", str(prd), "--json"],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if checked.returncode:
        print(checked.stdout + checked.stderr, file=sys.stderr)
        return 2
    try:
        pre = validate_preplan(prd)
    except Exception as e:
        print(f"DOMAIN_PREPLAN_BLOCKED: {e}", file=sys.stderr)
        return 2
    if pre:
        print("DOMAIN_PREPLAN_BLOCKED: " + str(pre), file=sys.stderr)
        return 2
    facts = parse_routing_facts(section(prd_text, "Routing Facts"))
    snapshot_line = ""
    if facts is not None:
        snapshot_line = (
            f"- Risk Facts Snapshot: `{snapshot_json(facts)}`\n"
            "- Source: approved PRD Routing Facts\n"
        )
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        prefix=".ges-v37-", suffix=".plan.md", dir=out.parent, delete=False
    ) as h:
        tmp = Path(h.name)
    tmp.unlink(missing_ok=True)
    try:
        r = subprocess.run(
            [sys.executable, str(V36), str(prd), str(tmp), "--plan-id", a.plan_id],
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
        )
        if r.returncode:
            print((r.stdout + r.stderr).strip(), file=sys.stderr)
            return r.returncode
        text = tmp.read_text(encoding="utf-8").replace(
            "plan_contract: smc.plan.v3.6", "plan_contract: smc.plan.v3.7", 1
        )
        text = text.replace(
            "domain_contract: smc.ges.domain-activation.v1",
            "domain_contract: smc.ges.domain-activation.v2",
            1,
        )
        if "governance_profile:" not in text.split("---", 2)[1]:
            text = insert_frontmatter(text, f"governance_profile: {profile}")
        try:
            text = apply_bindings(text, prd, profile, snapshot_line)
        except Exception as exc:
            return _binding_failed("seed", exc)
        if profile == "LEAN":
            # @lat: [[frontend-context#LEAN Compact Plan]]
            text = _omit_sections(text, LEAN_OMIT_SECTIONS)
            text = _inject_lean_decisions(text)
            # Opt out of full acceptance contract for LEAN unless already declared with live modes.
            if "acceptance_contract:" in text.split("---", 2)[1]:
                text = _set_fm(text, "acceptance_contract", "")
                # remove empty acceptance_contract line noise by rewriting to lean_compact
            text = _set_fm(text, "plan_compact", "LEAN")
        out.write_text(text, encoding="utf-8", newline="\n")
    finally:
        tmp.unlink(missing_ok=True)
    print(f"Plan v3.7 seed created: {out}\nPlan ID: {a.plan_id}\nGovernance profile: {profile}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
