from __future__ import annotations

from typing import Any

from pydantic import Field

from schemas.common import CamelModel


class JobReturnItem(CamelModel):
    jid: str
    endpoint_id: str
    function: str
    success: bool
    payload_redacted: dict[str, Any] = Field(default_factory=dict)


class JobReturnBatchRequest(CamelModel):
    request_id: str
    items: list[JobReturnItem]


class JobReturnItemResult(CamelModel):
    jid: str
    endpoint_id: str
    function: str
    status: str  # accepted | duplicate | rejected
    reason: str | None = None


class JobReturnBatchResponse(CamelModel):
    results: list[JobReturnItemResult]
