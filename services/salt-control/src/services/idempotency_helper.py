from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

from core.errors import ErrorCode, SaltControlError
from db.repositories.interfaces import IdempotencyRecord, RepositoryBundle


def request_digest(payload: Any) -> str:
    if hasattr(payload, "model_dump"):
        data = payload.model_dump(mode="json", by_alias=True)
    elif isinstance(payload, dict):
        data = payload
    else:
        data = {"value": str(payload)}
    raw = json.dumps(data, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


async def get_cached_response(repos: RepositoryBundle, key: str, digest: str) -> dict[str, Any] | None:
    record = await repos.idempotency.get(key)
    if record is None:
        return None
    if record.request_digest and record.request_digest != digest:
        raise SaltControlError(
            ErrorCode.CONFLICT,
            "idempotency key reused with different request payload",
            status_code=409,
        )
    return dict(record.response_json)


async def store_response(repos: RepositoryBundle, key: str, digest: str, response: dict[str, Any]) -> None:
    await repos.idempotency.put(
        IdempotencyRecord(
            key=key,
            response_json=response,
            request_digest=digest,
            created_at=datetime.now(UTC),
        )
    )
