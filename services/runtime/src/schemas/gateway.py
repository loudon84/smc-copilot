from __future__ import annotations

from pydantic import BaseModel


class GatewayHealthResponse(BaseModel):
    gateway_id: str
    profile_id: str
    status: str
    healthy: bool
    gateway_port: int
    gateway_pid: int | None
    message: str | None = None


class GatewayLogsResponse(BaseModel):
    gateway_id: str
    profile_id: str
    lines: list[str]
    truncated: bool = False
