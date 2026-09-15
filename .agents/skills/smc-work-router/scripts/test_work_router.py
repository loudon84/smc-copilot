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

    def test_retained_production_change_never_spike(self):
        # @lat: [[adaptive-governance-context-v508#Acceptance G51–G60#G53 Production Text Never Spike]]
        f = self.pure_research()
        f["retained_production_change"] = True
        out = route(f)
        self.assertNotEqual(out["work_class"], "SPIKE")
        self.assertNotEqual(out["governance_profile"], "NONE")

    def test_feature_complexity_derived_deterministic(self):
        # @lat: [[adaptive-governance-context-v508#Acceptance G51–G60#G51 Deterministic Complexity Receipt]]
        from work_router import derive_feature_complexity

        routed = route(self.facts())
        scope = {
            "schema": "smc.ges.feature-scope.v1",
            "app_id": "work",
            "surface_id": "work:sidebar.footer.identity",
            "layout_owner": "apps/work/src/Layout.tsx",
            "decision": "EXTEND",
            "ok": True,
        }
        a = derive_feature_complexity(routed, work_item_id="wi-1", feature_scope=scope)
        b = derive_feature_complexity(routed, work_item_id="wi-1", feature_scope=scope)
        self.assertEqual(a["schema"], "smc.ges.feature-complexity.v1")
        self.assertEqual(a["work_route_digest"], b["work_route_digest"])
        self.assertEqual(a["feature_scope_digest"], b["feature_scope_digest"])
        self.assertEqual(a["work_class"], routed["work_class"])
        self.assertEqual(a["governance_profile"], routed["governance_profile"])
        self.assertNotIn("error", a)

    def test_claimed_scope_missing_is_invalid(self):
        from work_router import derive_feature_complexity

        routed = route(self.facts())
        out = derive_feature_complexity(
            routed, work_item_id="wi-2", feature_scope=None, claimed_app_or_surface=True
        )
        self.assertEqual(out.get("error"), "FEATURE_SCOPE_INVALID")
        self.assertEqual(out["governance_profile"], "FULL")

    def test_classification_downgrade_denied_when_frozen(self):
        # @lat: [[adaptive-governance-context-v508#Acceptance G51–G60#G54 Downgrade Denied]]
        import tempfile
        from pathlib import Path

        import classification_state as cs

        with tempfile.TemporaryDirectory() as td:
            repo = Path(td)
            cs.apply_profile(repo, "wi-freeze", "FULL")
            cs.freeze(repo, "wi-freeze")
            with self.assertRaises(ValueError) as ctx:
                cs.apply_profile(repo, "wi-freeze", "LEAN")
            self.assertEqual(str(ctx.exception), "CLASSIFICATION_DOWNGRADE_DENIED")


if __name__ == "__main__":
    unittest.main()
