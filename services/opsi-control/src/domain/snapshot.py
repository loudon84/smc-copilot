from __future__ import annotations

import hashlib
import json

from domain.policy import ACCELERATED_V14, PilotPolicy, resolve_pilot_policy

CANARY_SIZE = ACCELERATED_V14.canary_size
FOLLOW_ON_SIZE = ACCELERATED_V14.follow_on_size
PILOT_MIN = ACCELERATED_V14.min_targets
PILOT_MAX = ACCELERATED_V14.max_targets
PRODUCTION_MIN = 21
PRODUCTION_MAX = 500
PRODUCTION_DEPOT_MAX = 8
MAX_DISPATCH_PER_TICK = 5
CANARY_OBSERVE_HOURS = ACCELERATED_V14.canary_hours
BATCH_OBSERVE_HOURS = ACCELERATED_V14.follow_on_hours
FINAL_OBSERVE_HOURS = ACCELERATED_V14.final_hours
GATE_POLICY_VERSION = "gate-v1.4.0"
GATE_POLICY_VERSION_V12 = "gate-v1.2.0"
PREFLIGHT_TTL_SECONDS = 3600


def canonicalize_client_ids(
    client_ids: list[str], *, mode: str = "pilot", policy: PilotPolicy | None = None
) -> list[str]:
    unique = sorted({item.strip() for item in client_ids if item.strip()})
    if not unique:
        raise ValueError("client_ids required")
    if mode == "production":
        if len(unique) < PRODUCTION_MIN or len(unique) > PRODUCTION_MAX:
            raise ValueError("production requires 21-500 endpoints")
        return unique
    bound = policy or ACCELERATED_V14
    if len(unique) > bound.max_targets:
        raise ValueError(f"pilot policy {bound.revision} supports at most {bound.max_targets} endpoints")
    return unique


def snapshot_digest(client_ids: list[str], *, mode: str = "pilot", policy: PilotPolicy | None = None) -> str:
    canonical = canonicalize_client_ids(client_ids, mode=mode, policy=policy)
    encoded = json.dumps(canonical, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def split_batches(
    client_ids: list[str], *, mode: str = "pilot", policy: PilotPolicy | None = None
) -> list[tuple[int, list[str], int]]:
    bound = policy or (None if mode == "production" else ACCELERATED_V14)
    if mode == "pilot" and bound is not None and len(client_ids) < bound.min_targets:
        raise ValueError(f"pilot policy {bound.revision} requires {bound.min_targets}-{bound.max_targets} endpoints")
    canonical = canonicalize_client_ids(client_ids, mode=mode, policy=bound)
    canary = bound.canary_size if bound else 2
    follow = bound.follow_on_size if bound else 5
    canary_hours = bound.canary_hours if bound else 24
    follow_hours = bound.follow_on_hours if bound else 6
    if len(canonical) < canary:
        raise ValueError("canary requires at least 2 endpoints")
    batches: list[tuple[int, list[str], int]] = [(0, canonical[:canary], canary_hours)]
    rest = canonical[canary:]
    index = 1
    for offset in range(0, len(rest), follow):
        chunk = rest[offset : offset + follow]
        batches.append((index, chunk, follow_hours))
        index += 1
    return batches


def policy_from_revision(revision: str | None) -> PilotPolicy:
    return resolve_pilot_policy(revision)
