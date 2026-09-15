#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODULE = HERE / "engineering_method.py"
spec = importlib.util.spec_from_file_location("engineering_method", MODULE)
assert spec and spec.loader
em = importlib.util.module_from_spec(spec)
spec.loader.exec_module(em)


class EngineeringMethodTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "repo"
        self.root.mkdir()
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        self.plan = self.root / "demo.plan.md"
        self.plan.write_text(
            """---
plan_id: method-demo
plan_contract: smc.plan.v3.7
---

## Todo T1 — Fix refresh timeout regression

**Writes**
- `src/session.py#refresh`

Reproduce the failing timeout and correct the broken behavior.

## Todo T2 — Update generated configuration metadata

**Writes**
- `config/app.json`

Update config metadata only.

## Todo T3 — Add retry behavior

**Writes**
- `src/retry.py#retry`

Add observable retry behavior.

## Todo T4 — Change authentication trust boundary

**Writes**
- `src/auth.py#authorize`

security boundary change: transfer token ownership across auth protocol.
""",
            encoding="utf-8",
        )

    def tearDown(self):
        self.tmp.cleanup()

    # @lat: [[ges-tests#GES Tests#Engineering Method Runtime#Classifies profiles and risk tiers]]
    def test_profiles(self):
        self.assertEqual(em.classify(self.plan, "T1")["profile"], "BUG_FIX")
        mechanical = em.classify(self.plan, "T2")
        self.assertEqual(mechanical["profile"], "MECHANICAL")
        self.assertEqual(mechanical["tdd_policy"], "TDD_NOT_APPLICABLE")
        self.assertEqual(em.classify(self.plan, "T3")["profile"], "BOUNDED_BEHAVIOR")
        high = em.classify(self.plan, "T4")
        self.assertEqual(high["profile"], "HIGH_RISK")
        self.assertEqual(high["model_tier"], "REASONING")
        self.assertEqual(high["review_depth"], "INDEPENDENT")

    # @lat: [[ges-tests#GES Tests#Engineering Method Runtime#Requires a RED-GREEN cycle]]
    def test_tdd_required_gate(self):
        em.classify(self.plan, "T1")
        code, payload = em.tdd_check(self.plan, "T1")
        self.assertEqual(code, 2)
        self.assertIn(payload["reason"], {"TDD_RED_NOT_CONFIRMED", "TDD_CYCLE_INCOMPLETE"})
        # Full receipt-bound RED→GREEN cycle is covered in test_engineering_method_v2 /
        # acceptance G18; here we only assert the required gate fails closed without evidence.

    # @lat: [[ges-tests#GES Tests#Engineering Method Runtime#Requires root cause before a bug fix]]
    def test_debug_requires_root_cause(self):
        em.classify(self.plan, "T1")
        code, payload = em.debug_check(self.plan, "T1")
        self.assertEqual(code, 2)
        self.assertIn(payload["reason"], {"DEBUG_ROOT_CAUSE_REQUIRED", "DEBUG_ROOT_CAUSE_EVIDENCE_REQUIRED"})
        # v3 requires reproduction evidence bound to root cause; assert the gate stays blocked
        # until a real reproduction receipt exists (covered thoroughly in test_engineering_method_v2).
        em.debug_event(self.plan, "T1", "ROOT_CAUSE", "CONFIRMED", "stale timer survives refresh")
        code, payload = em.debug_check(self.plan, "T1")
        self.assertEqual(code, 2)
        self.assertIn(payload["reason"], {"DEBUG_ROOT_CAUSE_EVIDENCE_REQUIRED", "DEBUG_VERIFICATION_REQUIRED"})

    # @lat: [[ges-tests#GES Tests#Engineering Method Runtime#Escalates three failed fixes]]
    def test_three_failed_fixes_escalate(self):
        em.classify(self.plan, "T1")
        em.debug_event(self.plan, "T1", "ROOT_CAUSE", "CONFIRMED", "root cause")
        for i in range(3):
            em.debug_event(self.plan, "T1", "FIX_ATTEMPT", "FAIL", f"attempt {i + 1}")
        code, payload = em.debug_check(self.plan, "T1")
        self.assertEqual(code, 3)
        self.assertEqual(payload["reason"], "DEBUG_ARCHITECTURE_ESCALATION")

    # @lat: [[ges-tests#GES Tests#Engineering Method Runtime#Persists explicit controller overrides]]
    def test_override_is_persisted(self):
        value = em.classify(self.plan, "T2", profile_override="BEHAVIOR_CHANGE", model_override="STANDARD")
        self.assertEqual(value["classification_source"], "override")
        # BEHAVIOR_CHANGE is a deprecated alias for BOUNDED_BEHAVIOR.
        self.assertEqual(value["profile"], "BOUNDED_BEHAVIOR")
        self.assertTrue(em.method_path(self.plan, "T2").is_file())

    # @lat: [[ges-tests#GES Tests#Engineering Method Runtime#Rejects a stale method artifact]]
    def test_stale_method_blocks_gate(self):
        em.classify(self.plan, "T2")
        self.plan.write_text(self.plan.read_text(encoding="utf-8") + "\nChanged semantic scope.\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "ENGINEERING_METHOD_PLAN_STALE"):
            em.tdd_check(self.plan, "T2")

    # @lat: [[ges-tests#GES Tests#Engineering Method Runtime#Rejects a malformed method artifact]]
    def test_malformed_method_blocks_gate(self):
        path = em.method_path(self.plan, "T2")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("not-json", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "ENGINEERING_METHOD_INVALID"):
            em.tdd_check(self.plan, "T2")


if __name__ == "__main__":
    unittest.main()
