from __future__ import annotations

from schemas.common import CamelModel


class SecretResolveRequest(CamelModel):
    endpoint_id: str
    user_id: str
    request_id: str
    refs: list[str]


class SecretValue(CamelModel):
    ref: str
    value: str
    status: str = "ok"


class SecretResolveResponse(CamelModel):
    secrets: list[SecretValue]
