import unittest

from work_router import RISKS, REQUIRED, route


class RoutingTests(unittest.TestCase):
    def facts(self):
        return {**dict.fromkeys(REQUIRED, True), **dict.fromkeys(RISKS, False), "governed": True}

    def pure_research(self):
        return {
            **dict.fromkeys(REQUIRED, True),
            **dict.fromkeys(RISKS, False),
            "research_intent": True,
            "governed": False,
            "retained_production_change": False,
            "production_write_requested": False,
            "durable_product_artifact_requested": False,
        }

    def test_governed_lean(self):
        self.assertEqual(route(self.facts())["governance_profile"], "LEAN")

    def test_unknown_forces_full(self):
        self.assertEqual(route({})["governance_profile"], "FULL")

    def test_no_downgrade(self):
        self.assertEqual(route(self.facts(), "FULL")["governance_profile"], "FULL")

    def test_each_risk(self):
        for risk in RISKS:
            f = self.facts()
            f[risk] = True
            self.assertEqual(route(f)["governance_profile"], "FULL")

    def test_research_only_alone_cannot_none(self):
        # @lat: [[ges-tests#GES Tests#Work Router Research Trust#Research only alone cannot none]]
        f = {**dict.fromkeys(REQUIRED, True), **dict.fromkeys(RISKS, False), "research_only": True}
        out = route(f)
        self.assertNotEqual(out["governance_profile"], "NONE")
        self.assertIn("WORK_RESEARCH_AUTHORITY_MISSING", out["reasons"])
        self.assertFalse(out["effective_research_only"])

    def test_governed_plus_research_forces_full(self):
        # @lat: [[ges-tests#GES Tests#Work Router Research Trust#Governed research forces full]]
        f = self.pure_research()
        f["governed"] = True
        out = route(f)
        self.assertEqual(out["governance_profile"], "FULL")
        self.assertIn("RESEARCH_ONLY_CONTRADICTS_GOVERNED_WORK", out["reasons"])

    def test_production_write_plus_research_forces_full(self):
        f = self.pure_research()
        f["production_write_requested"] = True
        out = route(f)
        self.assertEqual(out["governance_profile"], "FULL")
        self.assertIn("RESEARCH_ONLY_PRODUCTION_WRITE_CONFLICT", out["reasons"])

    def test_durable_artifact_plus_research_forces_full(self):
        f = self.pure_research()
        f["durable_product_artifact_requested"] = True
        out = route(f)
        self.assertEqual(out["governance_profile"], "FULL")
        self.assertIn("RESEARCH_ONLY_DURABLE_ARTIFACT_CONFLICT", out["reasons"])

    def test_unknown_governed_forces_full(self):
        f = self.pure_research()
        f["governed"] = None
        out = route(f)
        self.assertEqual(out["governance_profile"], "FULL")
        self.assertIn("WORK_RESEARCH_AUTHORITY_MISSING", out["reasons"])

    def test_pure_research_may_spike_none(self):
        # @lat: [[ges-tests#GES Tests#Work Router Research Trust#Pure research may spike none]]
        out = route(self.pure_research())
        self.assertEqual(out["work_class"], "SPIKE")
        self.assertEqual(out["governance_profile"], "NONE")
        self.assertTrue(out["effective_research_only"])

    def test_previous_lean_blocks_research_downgrade(self):
        out = route(self.pure_research(), "LEAN")
        self.assertNotEqual(out["governance_profile"], "NONE")
        self.assertFalse(out["effective_research_only"])

    def test_legacy_research_only_alias_with_authority(self):
        f = self.pure_research()
        del f["research_intent"]
        f["research_only"] = True
        out = route(f)
        self.assertEqual(out["governance_profile"], "NONE")
        self.assertTrue(out["effective_research_only"])


if __name__ == "__main__":
    unittest.main()
