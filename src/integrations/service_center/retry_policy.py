"""HTTP retry policy for Service Center (PRD v1.6 FR-103)."""

from __future__ import annotations

import asyncio
import random
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TypeVar

import httpx

T = TypeVar("T")

RETRYABLE_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})
NON_RETRYABLE_OPS = frozenset(
    {
        "enrollment_complete",
        "task_complete",
        "artifact_complete",
        "experience_submit",
    }
)


@dataclass
class RetryPolicy:
    max_attempts: int = 5
    max_elapsed_seconds: float = 60.0
    base_delay_seconds: float = 0.5
    max_delay_seconds: float = 15.0
    jitter_ratio: float = 0.2


def is_retryable_exception(exc: BaseException) -> bool:
    return isinstance(exc, (httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError))


def is_retryable_status(status_code: int) -> bool:
    return status_code in RETRYABLE_STATUS


def compute_delay(attempt: int, policy: RetryPolicy, *, retry_after: float | None = None) -> float:
    if retry_after is not None and retry_after >= 0:
        base = retry_after
    else:
        base = min(policy.max_delay_seconds, policy.base_delay_seconds * (2 ** max(0, attempt - 1)))
    jitter = base * policy.jitter_ratio * random.random()
    return min(policy.max_delay_seconds, base + jitter)


async def execute_with_retry(
    factory: Callable[[], Awaitable[T]],
    *,
    policy: RetryPolicy | None = None,
    idempotent: bool = True,
    idempotency_key: str | None = None,
    op_name: str | None = None,
) -> T:
    policy = policy or RetryPolicy()
    if op_name in NON_RETRYABLE_OPS and not idempotency_key:
        return await factory()
    if not idempotent and not idempotency_key:
        return await factory()

    attempt = 0
    elapsed = 0.0
    last_exc: BaseException | None = None
    while attempt < policy.max_attempts and elapsed < policy.max_elapsed_seconds:
        attempt += 1
        try:
            result = await factory()
            if isinstance(result, httpx.Response) and is_retryable_status(result.status_code):
                retry_after = None
                ra = result.headers.get("Retry-After")
                if ra:
                    try:
                        retry_after = float(ra)
                    except ValueError:
                        retry_after = None
                delay = compute_delay(attempt, policy, retry_after=retry_after)
                elapsed += delay
                await asyncio.sleep(delay)
                continue
            return result
        except Exception as exc:
            last_exc = exc
            if not is_retryable_exception(exc):
                raise
            delay = compute_delay(attempt, policy)
            elapsed += delay
            if attempt >= policy.max_attempts or elapsed >= policy.max_elapsed_seconds:
                break
            await asyncio.sleep(delay)
    if last_exc:
        raise last_exc
    raise RuntimeError("retry exhausted without result")
