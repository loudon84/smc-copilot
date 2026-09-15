"""Token budget controller keyed by governance profile LEAN|FULL."""
from __future__ import annotations

from typing import Any

_LEAN = {
    "governance_profile": "LEAN",
    "model_max_tier": "STANDARD",
    "independent_review": False,
    "max_review_rounds": 1,
    "context_mode": "targeted",
    "repeated_context_read": "cache_first",
}

_FULL = {
    "governance_profile": "FULL",
    "model_max_tier": "REASONING",
    "independent_review": True,
    "max_review_rounds": None,
    "context_mode": "expanded",
    "repeated_context_read": "cache_first",
}


# @lat: [[frontend-context#Token Budget]]
def budget_for(profile: str) -> dict[str, Any]:
    """Return token / review / context budget for LEAN or FULL."""
    key = (profile or "").strip().upper()
    if key == "LEAN":
        return dict(_LEAN)
    if key == "FULL":
        return dict(_FULL)
    raise ValueError(f"unknown governance profile: {profile!r}")
