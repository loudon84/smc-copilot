from __future__ import annotations

import hashlib
import json

CANARY_SIZE = 2
FOLLOW_ON_SIZE = 5
PILOT_MIN = 10
PILOT_MAX = 20
MAX_DISPATCH_PER_TICK = 5
CANARY_OBSERVE_HOURS = 24
BATCH_OBSERVE_HOURS = 6
FINAL_OBSERVE_HOURS = 24 * 7
GATE_POLICY_VERSION = "gate-v1.2.0"
PREFLIGHT_TTL_SECONDS = 3600


def canonicalize_client_ids(client_ids: list[str]) -> list[str]:
    unique = sorted({item.strip() for item in client_ids if item.strip()})
    if not unique:
        raise ValueError("client_ids required")
    if len(unique) > PILOT_MAX:
        raise ValueError("pilot supports at most 20 endpoints")
    return unique


def snapshot_digest(client_ids: list[str]) -> str:
    canonical = canonicalize_client_ids(client_ids)
    encoded = json.dumps(canonical, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def split_batches(client_ids: list[str]) -> list[tuple[int, list[str], int]]:
    canonical = canonicalize_client_ids(client_ids)
    if len(canonical) < CANARY_SIZE:
        raise ValueError("canary requires at least 2 endpoints")
    batches: list[tuple[int, list[str], int]] = [(0, canonical[:CANARY_SIZE], CANARY_OBSERVE_HOURS)]
    rest = canonical[CANARY_SIZE:]
    index = 1
    for offset in range(0, len(rest), FOLLOW_ON_SIZE):
        chunk = rest[offset : offset + FOLLOW_ON_SIZE]
        batches.append((index, chunk, BATCH_OBSERVE_HOURS))
        index += 1
    return batches
