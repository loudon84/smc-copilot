from __future__ import annotations

from collections import defaultdict

from domain.policy import ENGINEERING_V13, ProductionPolicy
from domain.snapshot import PRODUCTION_DEPOT_MAX

RING0_PER_DEPOT_MAX = ENGINEERING_V13.ring0_per_depot
RING0_GLOBAL_MAX = ENGINEERING_V13.ring0_global_max
RING_OBSERVE_HOURS = ENGINEERING_V13.observe_hours
RING_CUMULATIVE = ENGINEERING_V13.cumulative


def mapping_digest(mapping: dict[str, str]) -> str:
    import hashlib
    import json

    payload = [{"clientId": key, "depotId": mapping[key]} for key in sorted(mapping)]
    encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def split_rings(mapping: dict[str, str], policy: ProductionPolicy | None = None) -> list[tuple[int, list[str], int]]:
    bound = policy or ENGINEERING_V13
    if not mapping:
        raise ValueError("mapping required")
    if any(not depot for depot in mapping.values()):
        raise ValueError("every target requires a depot")
    depots = sorted(set(mapping.values()))
    max_depots = min(bound.max_depots, PRODUCTION_DEPOT_MAX)
    if not depots or len(depots) > max_depots:
        raise ValueError(f"production policy {bound.revision} supports 1-{bound.max_depots} depots")
    by_depot: dict[str, list[str]] = defaultdict(list)
    for client_id in sorted(mapping):
        by_depot[mapping[client_id]].append(client_id)
    ring0: list[str] = []
    for depot in depots:
        members = by_depot[depot]
        take = min(bound.ring0_per_depot, max(1, len(members)))
        ring0.extend(members[:take])
    if len(ring0) > bound.ring0_global_max:
        ring0 = []
        for depot in depots:
            ring0.append(by_depot[depot][0])
        extras = []
        for depot in depots:
            if len(by_depot[depot]) > 1:
                extras.append(by_depot[depot][1])
        for client_id in extras:
            if len(ring0) >= bound.ring0_global_max:
                break
            ring0.append(client_id)
        ring0 = ring0[: bound.ring0_global_max]
    covered = {mapping[item] for item in ring0}
    if covered != set(depots):
        raise ValueError("ring 0 must cover every depot")
    assigned = list(ring0)
    assigned_set = set(ring0)
    remaining = [item for item in sorted(mapping) if item not in assigned_set]
    rings: list[tuple[int, list[str], int]] = [(0, ring0, bound.observe_hours[0])]
    total = len(mapping)
    for index, fraction in enumerate(bound.cumulative, start=1):
        target_count = total if fraction >= 1 else max(len(assigned), int(total * fraction))
        need = max(0, target_count - len(assigned))
        chunk = remaining[:need]
        remaining = remaining[need:]
        if index == len(bound.cumulative):
            chunk = chunk + remaining
            remaining = []
        rings.append((index, chunk, bound.observe_hours[index]))
        assigned.extend(chunk)
    return rings


def split_rings_as_batches(
    mapping: dict[str, str], policy: ProductionPolicy | None = None
) -> list[tuple[int, list[str], int]]:
    return [(index, members, hours) for index, members, hours in split_rings(mapping, policy) if members or index == 0]
