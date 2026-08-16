from __future__ import annotations

import hashlib
import json
from collections import defaultdict

from domain.snapshot import PRODUCTION_DEPOT_MAX

RING0_PER_DEPOT_MAX = 2
RING0_GLOBAL_MAX = 25
RING_OBSERVE_HOURS = (24, 12, 12, 24, 24 * 14)
RING_CUMULATIVE = (0.10, 0.25, 0.50, 1.0)


def mapping_digest(mapping: dict[str, str]) -> str:
    payload = [{"clientId": key, "depotId": mapping[key]} for key in sorted(mapping)]
    encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def split_rings(mapping: dict[str, str]) -> list[tuple[int, list[str], int]]:
    if not mapping:
        raise ValueError("mapping required")
    if any(not depot for depot in mapping.values()):
        raise ValueError("every target requires a depot")
    depots = sorted(set(mapping.values()))
    if not depots or len(depots) > PRODUCTION_DEPOT_MAX:
        raise ValueError("production supports 1-8 depots")
    by_depot: dict[str, list[str]] = defaultdict(list)
    for client_id in sorted(mapping):
        by_depot[mapping[client_id]].append(client_id)
    ring0: list[str] = []
    for depot in depots:
        members = by_depot[depot]
        take = min(RING0_PER_DEPOT_MAX, max(1, len(members)))
        ring0.extend(members[:take])
    if len(ring0) > RING0_GLOBAL_MAX:
        ring0 = []
        for depot in depots:
            ring0.append(by_depot[depot][0])
        extras = []
        for depot in depots:
            if len(by_depot[depot]) > 1:
                extras.append(by_depot[depot][1])
        for client_id in extras:
            if len(ring0) >= RING0_GLOBAL_MAX:
                break
            ring0.append(client_id)
        ring0 = ring0[:RING0_GLOBAL_MAX]
    covered = {mapping[item] for item in ring0}
    if covered != set(depots):
        raise ValueError("ring 0 must cover every depot")
    assigned = list(ring0)
    assigned_set = set(ring0)
    remaining = [item for item in sorted(mapping) if item not in assigned_set]
    rings: list[tuple[int, list[str], int]] = [(0, ring0, RING_OBSERVE_HOURS[0])]
    total = len(mapping)
    for index, fraction in enumerate(RING_CUMULATIVE, start=1):
        target_count = total if fraction >= 1 else max(len(assigned), int(total * fraction))
        need = max(0, target_count - len(assigned))
        chunk = remaining[:need]
        remaining = remaining[need:]
        if index == len(RING_CUMULATIVE):
            chunk = chunk + remaining
            remaining = []
        rings.append((index, chunk, RING_OBSERVE_HOURS[index]))
        assigned.extend(chunk)
    return rings


def split_rings_as_batches(mapping: dict[str, str]) -> list[tuple[int, list[str], int]]:
    return [(index, members, hours) for index, members, hours in split_rings(mapping) if members or index == 0]
