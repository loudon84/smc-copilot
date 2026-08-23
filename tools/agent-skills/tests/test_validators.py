from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
PRD_VALIDATOR = ROOT / "tools" / "agent-skills" / "validate_prd.py"
PLAN_VALIDATOR = ROOT / "tools" / "agent-skills" / "validate_plan.py"


VALID_PRD = """---
work_item_id: TEST-1
version: v1
status: APPROVED
target_branch: opsi/prd-2.0
review_verdict: PASS
approved_at: 2026-08-21
---
# Test
## Current Capability Inventory
| Capability | Existing Owner | Existing Entry Point | Current Tests |
|---|---|---|---|
| config | owner | entry | test |
## Target End-State Inventory
| Capability | Production Owner | Allowed Implementations |
|---|---|---:|
| config | owner | 1 |
## Change Classification
| Item | Action | Target State |
|---|---|---|
| config | MODIFY | final |
## Acceptance Criteria
- [ ] works
"""


class ValidatorsTest(unittest.TestCase):
    def run_script(self, script: Path, target: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run([sys.executable, str(script), str(target)], text=True, capture_output=True)

    def test_prd_requires_remove_for_replace(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "PRD-test.md"
            path.write_text(VALID_PRD.replace("MODIFY", "REPLACE"), encoding="utf-8")
            result = self.run_script(PRD_VALIDATOR, path)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("PRD_REPLACEMENT_WITHOUT_REMOVAL", result.stderr)

    def test_plan_accepts_approved_prd(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            prd = base / "PRD-test.md"
            plan = base / "test.plan.md"
            prd.write_text(VALID_PRD, encoding="utf-8")
            plan.write_text(
                "# Plan\n\n## Approved PRD\n\n[PRD](PRD-test.md)\n\n## Change Matrix\n\n| File | Action | Existing Owner | Target State |\n|---|---|---|---|\n| a | MODIFY | owner | final |\n",
                encoding="utf-8",
            )
            result = self.run_script(PLAN_VALIDATOR, plan)
        self.assertEqual(result.returncode, 0, result.stderr)
