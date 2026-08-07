"""Exponential backoff with jitter for delivery outbox retries."""

from __future__ import annotations

import random


def compute_backoff_seconds(
    attempt: int,
    *,
    base_seconds: float = 2.0,
    max_seconds: float = 300.0,
    jitter_ratio: float = 0.2,
) -> float:
    """Return delay for the next attempt (1-based attempt after failure)."""
    attempt = max(1, attempt)
    delay = min(max_seconds, base_seconds * (2 ** (attempt - 1)))
    if jitter_ratio <= 0:
        return delay
    spread = delay * jitter_ratio
    return max(0.0, delay + random.uniform(-spread, spread))


def should_dead_letter(attempt_count: int, max_retries: int) -> bool:
    return attempt_count >= max_retries
