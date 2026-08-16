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


@dataclass(frozen=True)
class ProductionPolicy:
    revision: str
    min_targets: int
    max_targets: int
    max_depots: int
    ring0_per_depot: int
    ring0_global_max: int
    observe_hours: tuple[int, ...]
    cumulative: tuple[float, ...]
    live: bool

    def digest(self) -> str:
        payload = {
            "revision": self.revision,
            "minTargets": self.min_targets,
            "maxTargets": self.max_targets,
            "maxDepots": self.max_depots,
            "ring0PerDepot": self.ring0_per_depot,
            "ring0GlobalMax": self.ring0_global_max,
            "observeHours": list(self.observe_hours),
            "cumulative": list(self.cumulative),
            "live": self.live,
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

CONTROLLED_REENTRY_V15 = ProductionPolicy(
    revision="controlled-reentry-v1.5",
    min_targets=21,
    max_targets=50,
    max_depots=2,
    ring0_per_depot=1,
    ring0_global_max=4,
    observe_hours=(24, 12, 12, 24, 24 * 7),
    cumulative=(0.10, 0.25, 0.50, 1.0),
    live=True,
)

ENGINEERING_V13 = ProductionPolicy(
    revision="engineering-v1.3",
    min_targets=21,
    max_targets=500,
    max_depots=8,
    ring0_per_depot=2,
    ring0_global_max=25,
    observe_hours=(24, 12, 12, 24, 24 * 14),
    cumulative=(0.10, 0.25, 0.50, 1.0),
    live=False,
)

POLICIES = {policy.revision: policy for policy in (ACCELERATED_V14, LEGACY_V12)}
PRODUCTION_POLICIES = {policy.revision: policy for policy in (CONTROLLED_REENTRY_V15, ENGINEERING_V13)}
V14_GATE_POLICY = ACCELERATED_V14
V15_LIVE_POLICY = CONTROLLED_REENTRY_V15
PRODUCTION_REENTRY_GATE = "v1.5-production-reentry"
CONTROLLER_GATE = "v1.6-endpoint-controller"
V14_LIVE_GATE = "v1.4-win10-clean-endpoint"


def resolve_pilot_policy(revision: str | None) -> PilotPolicy:
    key = (revision or ACCELERATED_V14.revision).strip()
    policy = POLICIES.get(key)
    if policy is None:
        raise ValueError(f"unknown pilot policy: {key}")
    return policy


def resolve_production_policy(revision: str | None) -> ProductionPolicy:
    key = (revision or CONTROLLED_REENTRY_V15.revision).strip()
    policy = PRODUCTION_POLICIES.get(key)
    if policy is None:
        raise ValueError(f"unknown production policy: {key}")
    return policy


def satisfies_v14_gate(policy: PilotPolicy) -> bool:
    return policy.revision == V14_GATE_POLICY.revision and policy.digest() == V14_GATE_POLICY.digest()


def satisfies_v15_live_gate(policy: ProductionPolicy) -> bool:
    return policy.revision == V15_LIVE_POLICY.revision and policy.digest() == V15_LIVE_POLICY.digest()
