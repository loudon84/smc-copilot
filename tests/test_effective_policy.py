"""Effective policy merge tests (PRD FR-601)."""

from __future__ import annotations

from runtime.policy.effective_policy import EffectivePolicy


# @lat: [[tests#Effective Policy#Center cannot loosen local deny]]
def test_center_cannot_loosen_local_deny() -> None:
    policy = EffectivePolicy(
        local={"tools": {"deny": ["rm -rf", "format"]}},
        center={"tools": {"allow": ["rm -rf"]}},
    )
    merged = policy.merge()
    deny = merged["tools"].get("deny", [])
    assert "rm -rf" in deny
    assert policy.is_denied("tools", "deny", "rm -rf /tmp")


def test_layers_tighten_workspace() -> None:
    policy = EffectivePolicy(
        local={"workspace": {"allow": ["/projects"]}},
        profile={"workspace": {"deny": ["../escape"]}},
    )
    merged = policy.merge()
    assert "deny" in merged["workspace"]
    assert "../escape" in merged["workspace"]["deny"]
