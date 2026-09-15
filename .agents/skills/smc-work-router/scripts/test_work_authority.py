#!/usr/bin/env python3
"""Work authority binding tests (PRD v5.0.2 C10)."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from work_authority import build_authority, verify_authority
from work_router import REQUIRED, RISKS, route


def safe(**extra):
    return {**dict.fromkeys(REQUIRED, True), **dict.fromkeys(RISKS, False), **extra}


class WorkAuthorityTests(unittest.TestCase):
    def test_tw01_no_authority_cli_none_forbidden(self):
        f = safe(
            research_intent=True,
            governed=False,
            retained_production_change=False,
            production_write_requested=False,
            durable_product_artifact_requested=False,
        )
        out = route(f, require_authority_for_none=True)
        self.assertEqual(out["governance_profile"], "FULL")
        self.assertIn("WORK_AUTHORITY_MISSING", out["reasons"])

    def test_tw02_verified_authority_pure_research(self):
        auth = build_authority(
            "RM-1",
            {
                "governed": False,
                "retained_production_change": False,
                "production_write_requested": False,
                "durable_product_artifact_requested": False,
            },
            [{"type": "ORCHESTRATOR_REQUEST", "path": "", "sha256": "", "authority": "ORCHESTRATOR"}],
        )
        status, _ = verify_authority(auth)
        self.assertEqual(status, "VERIFIED")
        f = safe(research_intent=True)
        out = route(f, authority=auth, require_authority_for_none=True)
        self.assertEqual(out["governance_profile"], "NONE")
        self.assertEqual(out["authority_status"], "VERIFIED")

    def test_tw03_authority_governed_overrides_caller(self):
        auth = build_authority(
            "RM-1",
            {
                "governed": True,
                "retained_production_change": False,
                "production_write_requested": False,
                "durable_product_artifact_requested": False,
            },
            [{"type": "PLAN", "path": "p.md", "sha256": "sha256:x", "authority": "CANONICAL"}],
        )
        f = safe(
            research_intent=True,
            governed=False,
            retained_production_change=False,
            production_write_requested=False,
            durable_product_artifact_requested=False,
        )
        out = route(f, authority=auth, require_authority_for_none=True)
        self.assertEqual(out["governance_profile"], "FULL")
        self.assertTrue(out["facts"]["governed"] is True)

    def test_tw04_stale_digest(self):
        auth = build_authority(
            "RM-1",
            {
                "governed": False,
                "retained_production_change": False,
                "production_write_requested": False,
                "durable_product_artifact_requested": False,
            },
            [{"type": "ORCHESTRATOR_REQUEST", "path": "", "sha256": "", "authority": "ORCHESTRATOR"}],
        )
        auth["authority_sha256"] = "sha256:dead"
        status, reasons = verify_authority(auth)
        self.assertEqual(status, "STALE")
        out = route(safe(research_intent=True), authority=auth, require_authority_for_none=True)
        self.assertNotEqual(out["governance_profile"], "NONE")

    def test_tw06_previous_lean_blocks_none(self):
        auth = build_authority(
            "RM-1",
            {
                "governed": False,
                "retained_production_change": False,
                "production_write_requested": False,
                "durable_product_artifact_requested": False,
            },
            [{"type": "ORCHESTRATOR_REQUEST", "path": "", "sha256": "", "authority": "ORCHESTRATOR"}],
        )
        out = route(safe(research_intent=True), previous="LEAN", authority=auth, require_authority_for_none=True)
        self.assertNotEqual(out["governance_profile"], "NONE")


if __name__ == "__main__":
    unittest.main()
