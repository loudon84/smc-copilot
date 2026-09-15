#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from assess_plan_review import classify
from build_review_packet import accept, build


LOW_RISK = """---
plan_id: demo-plan
plan_contract: smc.plan.v3.5
---
# Demo

## Change Matrix

| Change | Owner | Target |
|---|---|---|
| C01 | ExistingService | src/demo.py#run |

## Todo T1 — adjust existing validation

**Owns Changes**
- C01

**Writes**
- `src/demo.py#run`
"""

HIGH_RISK = LOW_RISK.replace("plan_contract: smc.plan.v3.5", "plan_contract: smc.plan.v3.5\nacceptance_contract: smc.acceptance.v1")


class AdaptivePlanReviewTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        self.plan = self.root / "demo.plan.md"

    def tearDown(self):
        self.tmp.cleanup()

    # @lat: [[ges-tests#GES Tests#Runtime Cost Optimization#Skips semantic review for low risk]]
    def test_low_risk_first_review_is_none(self):
        self.plan.write_text(LOW_RISK, encoding="utf-8")
        result = classify(self.plan)
        self.assertEqual((result["route"], result["depth"]), ("NOT_REQUIRED", "NONE"))

    # @lat: [[ges-tests#GES Tests#Runtime Cost Optimization#Escalates acceptance review to full]]
    def test_acceptance_forces_full(self):
        self.plan.write_text(HIGH_RISK, encoding="utf-8")
        result = classify(self.plan)
        self.assertEqual((result["route"], result["depth"]), ("REQUIRED", "FULL"))

    # @lat: [[ges-tests#GES Tests#Runtime Cost Optimization#Routes a reviewed semantic delta]]
    def test_prior_review_then_change_routes_delta(self):
        self.plan.write_text(LOW_RISK, encoding="utf-8")
        current = classify(self.plan)["plan_sha256"]
        review = self.root / ".smc" / "reviews" / "demo-plan.jsonl"
        review.parent.mkdir(parents=True, exist_ok=True)
        review.write_text(json.dumps({"kind": "plan", "verdict": "PASS", "plan_sha256": current}) + "\n", encoding="utf-8")
        accept(self.plan)
        self.plan.write_text(LOW_RISK.replace("adjust existing validation", "adjust existing validation safely"), encoding="utf-8")
        result = classify(self.plan)
        self.assertEqual((result["route"], result["depth"]), ("REQUIRED", "DELTA"))
        packet = build(self.plan, "DELTA")
        self.assertEqual(packet["review_depth"], "DELTA")
        self.assertIn("safely", packet["semantic_diff"])

    # @lat: [[ges-tests#GES Tests#Runtime Cost Optimization#Fails closed without a semantic snapshot]]
    def test_delta_without_snapshot_upgrades_full(self):
        self.plan.write_text(LOW_RISK, encoding="utf-8")
        packet = build(self.plan, "DELTA")
        self.assertEqual(packet["review_depth"], "FULL")

    # @lat: [[ges-tests#GES Tests#Runtime Cost Optimization#Requires a fresh pass before snapshot]]
    def test_snapshot_requires_fresh_pass_record(self):
        self.plan.write_text(LOW_RISK, encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "REQUIRES_REVIEW_RECORD"):
            accept(self.plan)

    def test_stale_pass_plus_schema_migration_is_full(self):
        self.plan.write_text(LOW_RISK, encoding="utf-8")
        current = classify(self.plan)["plan_sha256"]
        review = self.root / ".smc" / "reviews" / "demo-plan.jsonl"
        review.parent.mkdir(parents=True, exist_ok=True)
        review.write_text(json.dumps({"kind": "plan", "verdict": "PASS", "plan_sha256": current}) + "\n", encoding="utf-8")
        facts = {
            "new_owner": False,
            "public_contract": False,
            "security_boundary": False,
            "schema_migration": True,
            "protocol_change": False,
            "external_dependency": False,
            "lifecycle_change": False,
            "cross_domain_ownership": False,
            "live_acceptance": False,
        }
        self.plan.write_text(
            LOW_RISK.replace("adjust existing validation", "adjust with migration")
            + f"\n## Governance Profile\n\n- Risk Facts Snapshot: `{json.dumps(facts)}`\n",
            encoding="utf-8",
        )
        result = classify(self.plan)
        self.assertEqual(result["depth"], "FULL")
        self.assertIn("PLAN_REVIEW_CURRENT_RISK_FULL_REQUIRED", result["reasons"])
        self.assertIn("PLAN_REVIEW_HARD_RISK_FULL_REQUIRED", result["reasons"])

    def _stale_pass_then_hard(self, flag: str):
        self.plan.write_text(LOW_RISK, encoding="utf-8")
        current = classify(self.plan)["plan_sha256"]
        review = self.root / ".smc" / "reviews" / "demo-plan.jsonl"
        review.parent.mkdir(parents=True, exist_ok=True)
        review.write_text(json.dumps({"kind": "plan", "verdict": "PASS", "plan_sha256": current}) + "\n", encoding="utf-8")
        facts = {
            "new_owner": False,
            "public_contract": False,
            "security_boundary": False,
            "schema_migration": False,
            "protocol_change": False,
            "external_dependency": False,
            "lifecycle_change": False,
            "cross_domain_ownership": False,
            "live_acceptance": False,
        }
        facts[flag] = True
        self.plan.write_text(
            LOW_RISK.replace("adjust existing validation", f"adjust with {flag}")
            + f"\n## Governance Profile\n\n- Risk Facts Snapshot: `{json.dumps(facts)}`\n",
            encoding="utf-8",
        )
        result = classify(self.plan)
        self.assertEqual(result["depth"], "FULL", msg=flag)
        self.assertIn("PLAN_REVIEW_CURRENT_RISK_FULL_REQUIRED", result["reasons"])

    def test_stale_pass_plus_public_contract_is_full(self):
        self._stale_pass_then_hard("public_contract")

    def test_stale_pass_plus_security_boundary_is_full(self):
        self._stale_pass_then_hard("security_boundary")

    def test_stale_pass_plus_live_acceptance_is_full(self):
        self._stale_pass_then_hard("live_acceptance")

    def test_fresh_pass_high_risk_is_none(self):
        facts = {
            "new_owner": False,
            "public_contract": True,
            "security_boundary": False,
            "schema_migration": False,
            "protocol_change": False,
            "external_dependency": False,
            "lifecycle_change": False,
            "cross_domain_ownership": False,
            "live_acceptance": False,
        }
        text = (
            LOW_RISK
            + f"\n## Governance Profile\n\n- Risk Facts Snapshot: `{json.dumps(facts)}`\n"
        )
        self.plan.write_text(text, encoding="utf-8")
        current = classify(self.plan)["plan_sha256"]
        review = self.root / ".smc" / "reviews" / "demo-plan.jsonl"
        review.parent.mkdir(parents=True, exist_ok=True)
        review.write_text(json.dumps({"kind": "plan", "verdict": "PASS", "plan_sha256": current}) + "\n", encoding="utf-8")
        result = classify(self.plan)
        self.assertEqual((result["route"], result["depth"]), ("NOT_REQUIRED", "NONE"))

    def test_stale_revise_is_full(self):
        self.plan.write_text(LOW_RISK, encoding="utf-8")
        current = classify(self.plan)["plan_sha256"]
        review = self.root / ".smc" / "reviews" / "demo-plan.jsonl"
        review.parent.mkdir(parents=True, exist_ok=True)
        review.write_text(json.dumps({"kind": "plan", "verdict": "REVISE", "plan_sha256": current}) + "\n", encoding="utf-8")
        self.plan.write_text(LOW_RISK.replace("adjust existing validation", "adjust again"), encoding="utf-8")
        result = classify(self.plan)
        self.assertEqual(result["depth"], "FULL")


if __name__ == "__main__":
    unittest.main()
