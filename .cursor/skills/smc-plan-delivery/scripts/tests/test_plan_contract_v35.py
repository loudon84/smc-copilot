from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))

import common
import plan_state
import validate_delivery_completion

from test_delivery_tools import PLAN as V34_PLAN

VALIDATOR_SCRIPTS = HERE.parents[1] / "smc-plan-validator" / "scripts"
AC_ROW = "| AC-01 | AC | works | BEHAVIOR | C01 | T1 | V01 | UNIT | yes |"
DOD_ROW = "| DOD-01 | DOD | tests pass | BEHAVIOR | C01 | T1 | V01 | UNIT | yes |"
V35_PLAN = V34_PLAN.replace(
    "plan_contract: smc.plan.v3.4", "plan_contract: smc.plan.v3.5"
).replace(AC_ROW, AC_ROW + "\n" + DOD_ROW)
APPROVED_PRD = """---
status: APPROVED
review_verdict: PASS
approved_at: now
work_item_id: RM-01
version: 1.0
source_revision: RM-01@1.0
grounded_commit: deadbeef
---

## Acceptance Criteria

1. works

## Definition of Done

1. tests pass
"""


def load_validator_core():
    path = VALIDATOR_SCRIPTS / "validate_plan_v33.py"
    spec = importlib.util.spec_from_file_location("smc_plan_validator_core", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class PlanContractV35Test(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        (self.root / ".cursor/plans").mkdir(parents=True)
        self.plan = self.root / ".cursor/plans/rm-01.plan.md"
        self.plan.write_text(V35_PLAN, encoding="utf-8")
        (self.root / ".cursor/prd.md").write_text(APPROVED_PRD, encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def test_v35_is_deliverable_and_v33_is_legacy(self):
        # @lat: [[ges-tests#GES Tests#Plan contract#v3.5 is deliverable]]
        self.assertIn("smc.plan.v3.5", common.DELIVERABLE_PLAN_CONTRACTS)
        self.assertIn("smc.plan.v3.4", common.DELIVERABLE_PLAN_CONTRACTS)
        self.assertNotIn("smc.plan.v3.3", common.DELIVERABLE_PLAN_CONTRACTS)

    def test_validator_name_is_contract_bound(self):
        # @lat: [[ges-tests#GES Tests#Plan contract#Validator selection is contract-bound]]
        self.assertEqual("validate_plan_v35.py", common.plan_validator_name("smc.plan.v3.5"))
        self.assertEqual("validate_plan_v34.py", common.plan_validator_name("smc.plan.v3.4"))
        self.assertEqual("validate_plan_v33.py", common.plan_validator_name("smc.plan.v3.3"))
        self.assertEqual("validate_plan_v33.py", common.plan_validator_name(""))
        for name in common.PLAN_VALIDATORS.values():
            self.assertTrue((VALIDATOR_SCRIPTS / name).is_file(), name)

    def test_delivery_completion_selects_v35_validator(self):
        # @lat: [[ges-tests#GES Tests#Plan contract#Delivery completion selects v3.5 validator]]
        validator = validate_delivery_completion.static_validator(self.root, self.plan)
        self.assertEqual("validate_plan_v35.py", validator.name)

    def test_v35_passes_the_legacy_structural_core(self):
        # @lat: [[ges-tests#GES Tests#Plan contract#v3.5 downgrades for the v3.2 core]]
        core = load_validator_core()
        self.assertEqual([], core.validate_plan(self.plan, "smc.plan.v3.5"))
        compat = core.transform_to_v32(self.plan.read_text(encoding="utf-8"))
        self.assertIn("plan_contract: smc.plan.v3.2", compat)
        self.assertNotIn("plan_contract: smc.plan.v3.5", compat)

    def test_v35_enforces_cursor_content_projection(self):
        # @lat: [[ges-tests#GES Tests#Plan contract#v3.5 enforces content projection]]
        self.assertEqual([], plan_state.validate(self.plan))
        drifted = self.plan.read_text(encoding="utf-8").replace("change app [C01]", "old title [C01]")
        self.plan.write_text(drifted, encoding="utf-8")
        self.assertTrue(
            any(x.startswith("PLAN_CURSOR_TODO_CONTENT_DRIFT") for x in plan_state.validate(self.plan)),
            plan_state.validate(self.plan),
        )


if __name__ == "__main__":
    unittest.main()
