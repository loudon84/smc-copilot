from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RateBudget:
    max_in_flight: int
    requests_per_minute: int
    retry_budget: int


GLOBAL_BUDGET = RateBudget(max_in_flight=25, requests_per_minute=60, retry_budget=3)
CAMPAIGN_BUDGET = RateBudget(max_in_flight=10, requests_per_minute=30, retry_budget=3)
DEPOT_BUDGET = RateBudget(max_in_flight=4, requests_per_minute=12, retry_budget=2)


def strictest(*budgets: RateBudget) -> RateBudget:
    return RateBudget(
        max_in_flight=min(item.max_in_flight for item in budgets),
        requests_per_minute=min(item.requests_per_minute for item in budgets),
        retry_budget=min(item.retry_budget for item in budgets),
    )


def fair_depot_order(depot_ids: list[str], last_served: str = "") -> list[str]:
    ordered = sorted(depot_ids)
    if not last_served or last_served not in ordered:
        return ordered
    index = ordered.index(last_served)
    return ordered[index + 1 :] + ordered[: index + 1]
