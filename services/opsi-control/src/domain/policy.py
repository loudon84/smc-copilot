from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass


@dataclass(frozen=True)
class PilotPolicy:
    revision: str
    min_targets: int
    max_targets: int
    canary_size: int
    canary_hours: int
    follow_on_size: int
    follow_on_hours: int
    final_hours: int

    def digest(self) -> str:
        payload = {
            "revision": self.revision,
            "minTargets": self.min_targets,
            "maxTargets": self.max_targets,
            "canarySize": self.canary_size,
            "canaryHours": self.canary_hours,
            "followOnSize": self.follow_on_size,
            "followOnHours": self.follow_on_hours,
            "finalHours": self.final_hours,
        }
        encoded = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()


ACCELERATED_V14 = PilotPolicy(
    revision="accelerated-v1.4",
    min_targets=3,
    max_targets=5,
    canary_size=2,
    canary_hours=4,
    follow_on_size=3,
    follow_on_hours=1,
    final_hours=24,
)

LEGACY_V12 = PilotPolicy(
    revision="legacy-v1.2",
    min_targets=10,
    max_targets=20,
    canary_size=2,
    canary_hours=24,
    follow_on_size=5,
    follow_on_hours=6,
    final_hours=24 * 7,
)

POLICIES = {policy.revision: policy for policy in (ACCELERATED_V14, LEGACY_V12)}
V14_GATE_POLICY = ACCELERATED_V14
PRODUCTION_REENTRY_GATE = "v1.5-production-reentry"


def resolve_pilot_policy(revision: str | None) -> PilotPolicy:
    key = (revision or ACCELERATED_V14.revision).strip()
    policy = POLICIES.get(key)
    if policy is None:
        raise ValueError(f"unknown pilot policy: {key}")
    return policy


def satisfies_v14_gate(policy: PilotPolicy) -> bool:
    return policy.revision == V14_GATE_POLICY.revision and policy.digest() == V14_GATE_POLICY.digest()
