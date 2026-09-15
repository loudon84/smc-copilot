#!/usr/bin/env python3
"""Work facts trust-boundary tests (v5.0.3 C02 / R05–R07)."""
from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from work_facts import ALL_FACTS, build_envelope, conservative_merge, from_work_authority, verify_envelope
from work_authority import build_authority
from work_router import REQUIRED, RISKS, route, route_bound


def safe(**extra):
    base = {
        **dict.fromkeys(REQUIRED, True),
        **dict.fromkeys(RISKS, False),
        "research_intent": False,
        "governed": True,
        "retained_production_change": False,
        "production_write_requested": False,
        "durable_product_artifact_requested": False,
    }
    base.update(extra)
    for k in ALL_FACTS:
        base.setdefault(k, False if k in RISKS or k in {
            "retained_production_change",
            "production_write_requested",
            "durable_product_artifact_requested",
            "research_intent",
        } else True if k in REQUIRED else False)
    return {k: base.get(k) for k in ALL_FACTS}


def _req_sha(payload: str = "req-1") -> str:
    return "sha256:" + hashlib.sha256(payload.encode()).hexdigest()


def full_prov(
    *,
    kind: str = "ORCHESTRATOR_REQUEST",
    ref: str = "request:test-1",
    sha: str | None = None,
    authority: str = "ORCHESTRATOR",
) -> dict:
    sha = sha or _req_sha()
    return {
        k: {
            "source_kind": kind,
            "source_ref": ref,
            "source_sha256": sha,
            "authority": authority,
        }
        for k in ALL_FACTS
    }


class WorkFactsTests(unittest.TestCase):
    # @lat: [[safety-runtime-closure-v503]]

    def test_ac12_production_requires_provenance(self):
        env = build_envelope(
            "RM-1",
            safe(
                research_intent=True,
                governed=False,
                retained_production_change=False,
                production_write_requested=False,
                durable_product_artifact_requested=False,
            ),
            provenance={},
        )
        status, reasons = verify_envelope(env)
        self.assertEqual(status, "UNBOUND")
        self.assertTrue("WORK_FACTS_UNBOUND" in reasons or "WORK_FACTS_PROVENANCE_MISSING" in reasons)
        out = route_bound(None, env)
        self.assertNotEqual(out["governance_profile"], "NONE")

    def test_r05_incomplete_provenance(self):
        facts = safe(governed=False, research_intent=True)
        prov = full_prov()
        del prov["governed"]
        env = build_envelope("RM-1", facts, prov)
        status, reasons = verify_envelope(env)
        self.assertEqual(status, "UNBOUND")
        self.assertIn("WORK_FACTS_PROVENANCE_MISSING", reasons)

    def test_unrelated_provenance_cannot_authorize_governed_false(self):
        facts = safe(governed=False, research_intent=True)
        # Only unrelated key has real provenance; others missing → unbound.
        prov = {"new_owner": full_prov()["new_owner"]}
        env = build_envelope("RM-1", facts, prov)
        status, reasons = verify_envelope(env)
        self.assertNotEqual(status, "VERIFIED")
        self.assertTrue(
            "WORK_FACTS_PROVENANCE_MISSING" in reasons or "WORK_FACTS_UNBOUND" in reasons
        )

    def test_ac13_plan_forces_conflict(self):
        env = build_envelope(
            "RM-1",
            safe(
                research_intent=True,
                governed=False,
                retained_production_change=False,
                production_write_requested=False,
                durable_product_artifact_requested=False,
            ),
            provenance=full_prov(kind="PLAN", ref="plans/x.plan.md", sha=_req_sha("plan")),
        )
        status, reasons = verify_envelope(env)
        self.assertEqual(status, "CONFLICT")
        self.assertIn("WORK_FACTS_CONFLICT", reasons)
        out = route_bound(Path("."), env)
        self.assertEqual(out["governance_profile"], "FULL")

    def test_ac14_digest_change_stales(self):
        env = build_envelope(
            "RM-1",
            safe(research_intent=True, governed=False),
            provenance=full_prov(),
        )
        env["facts_digest"] = "sha256:dead"
        status, reasons = verify_envelope(env)
        self.assertEqual(status, "STALE")
        self.assertIn("WORK_FACTS_STALE", reasons)

    def test_r06_source_byte_change_stales(self):
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td)
            src = repo / "docs" / "prd.md"
            src.parent.mkdir(parents=True)
            src.write_text("v1\n", encoding="utf-8", newline="\n")
            dig = "sha256:" + hashlib.sha256(src.read_bytes()).hexdigest()
            env = build_envelope(
                "RM-1",
                safe(research_intent=False, governed=True),
                provenance=full_prov(kind="PRD", ref="docs/prd.md", sha=dig, authority="CANONICAL"),
            )
            status, _ = verify_envelope(env, repo=repo)
            self.assertEqual(status, "VERIFIED")
            src.write_text("v2\n", encoding="utf-8", newline="\n")
            status, reasons = verify_envelope(env, repo=repo)
            self.assertEqual(status, "STALE")
            self.assertIn("WORK_FACTS_STALE", reasons)
            out = route_bound(repo, env)
            self.assertEqual(out["governance_profile"], "FULL")

    def test_ac04_route_bound_requires_repo(self):
        env = build_envelope(
            "RM-1",
            safe(research_intent=True, governed=False),
            provenance=full_prov(),
        )
        out = route_bound(None, env)
        self.assertEqual(out["governance_profile"], "FULL")
        self.assertIn("WORK_FACTS_REPO_REQUIRED", out["reasons"])
        self.assertFalse(out["receipt_eligible"])

    def test_r07_caller_true_wins_over_envelope_false(self):
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td)
            env = build_envelope(
                "RM-1",
                safe(security_boundary=False, governed=True),
                provenance=full_prov(),
            )
            # Envelope claims false; caller asserts true → true wins → FULL
            out = route_bound(repo, env, caller_facts={"security_boundary": True})
            self.assertTrue(out["facts"]["security_boundary"] is True)
            self.assertEqual(out["governance_profile"], "FULL")
            self.assertTrue(any(d.get("decision") == "true_wins" for d in out["merge_decisions"]))

    def test_ac15_worker_assertion_cannot_none(self):
        env = build_envelope(
            "RM-1",
            safe(research_intent=True, governed=False),
            provenance=full_prov(kind="WORKER_ASSERTION", ref="request:x", sha=_req_sha()),
        )
        status, reasons = verify_envelope(env)
        self.assertEqual(status, "INVALID")
        self.assertIn("WORK_FACTS_AUTHORITY_MISSING", reasons)

    def test_verified_orchestrator_research_none(self):
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td)
            env = build_envelope(
                "RM-1",
                safe(
                    research_intent=True,
                    governed=False,
                    retained_production_change=False,
                    production_write_requested=False,
                    durable_product_artifact_requested=False,
                ),
                provenance=full_prov(),
            )
            status, _ = verify_envelope(env, repo=repo)
            self.assertEqual(status, "VERIFIED")
            out = route_bound(repo, env)
            self.assertEqual(out["governance_profile"], "NONE")
            self.assertTrue(out["receipt_eligible"])

    def test_raw_route_not_production_receipt(self):
        out = route(safe(research_intent=True, governed=False))
        self.assertFalse(out.get("receipt_eligible"))

    def test_authority_compat_shim(self):
        auth = build_authority(
            "RM-1",
            {
                "governed": False,
                "retained_production_change": False,
                "production_write_requested": False,
                "durable_product_artifact_requested": False,
            },
            [{"type": "ORCHESTRATOR_REQUEST", "path": "request:compat", "sha256": _req_sha("c"), "authority": "ORCHESTRATOR"}],
        )
        env = from_work_authority(auth)
        self.assertEqual(env["schema"], "smc.ges.work-facts.v1")
        # Compat envelope lacks full per-fact provenance → cannot NONE via bound path.
        status, _ = verify_envelope(env)
        self.assertNotEqual(status, "VERIFIED")
        out = route(safe(research_intent=True), authority=auth, require_authority_for_none=True)
        # Legacy authority path may still NONE when authority verifies; bound work-facts must not.
        self.assertIn(out["governance_profile"], {"NONE", "FULL", "LEAN"})

    def test_conservative_merge_true_wins(self):
        merged, decisions = conservative_merge(
            {"governed": True, "security_boundary": True},
            {"governed": False, "security_boundary": False},
        )
        self.assertTrue(merged["governed"])
        self.assertTrue(merged["security_boundary"])
        self.assertTrue(decisions)


if __name__ == "__main__":
    unittest.main()
