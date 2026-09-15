"""Unit tests for structured risk runtime."""
from __future__ import annotations

import unittest

from risk_signals import classify_text_hint, resolve_risk


class RiskSignalTests(unittest.TestCase):
    def safe_facts(self):
        return {
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

    def test_negated_schema_migration_not_high(self):
        # @lat: [[ges-tests#GES Tests#Structured Risk Runtime#Negated schema migration is not high risk]]
        text = "No schema migration. Authentication boundary unchanged."
        out = resolve_risk(text, self.safe_facts())
        self.assertFalse(out["high_risk"])
        self.assertEqual(classify_text_hint(text, "schema_migration"), "NEGATED")

    def test_affirmative_contradiction_fails_closed(self):
        # @lat: [[ges-tests#GES Tests#Structured Risk Runtime#Affirmative contradiction fails closed]]
        text = "This change requires schema migration."
        out = resolve_risk(text, self.safe_facts())
        self.assertTrue(out["high_risk"])
        self.assertTrue(any(e["code"] == "RISK_FACT_CONTRADICTION" for e in out["errors"]))


if __name__ == "__main__":
    unittest.main()
