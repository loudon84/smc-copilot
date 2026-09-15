import shlex
import sys
from pathlib import Path

sys.path.insert(0, str(Path(r"E:/git/smc-copilot/.agents/skills/smc-plan-delivery/scripts")))
from evidence import expected_plan_command, run_cmd  # type: ignore

plan = Path(r"E:/git/smc-copilot/.cursor/plans/work-v4.0.1-m6g-streaming-delta-contract-import.plan.md")
failed = []
for vid in ("V01", "V02", "V03", "V04"):
    rendered = expected_plan_command(plan, vid)
    if not rendered:
        raise SystemExit(f"missing command {vid}")
    argv = shlex.split(rendered)
    print(f"=== RUN {vid} argv0={argv[0]} ===")
    rc = run_cmd(plan, vid, argv)
    if rc != 0:
        failed.append((vid, rc))

if failed:
    print("FAILED", failed)
    raise SystemExit(1)
print("ALL_EVIDENCE_PASS")
