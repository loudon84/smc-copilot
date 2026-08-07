from __future__ import annotations

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "smc-copilot-serve"
    version: str = "0.1.0"


class SystemInfoResponse(BaseModel):
    service: str
    version: str
    hermes_home: str
    sqlite_path: str
    default_gateway_port: int


class ServiceProfileCountsResponse(BaseModel):
    total: int
    running: int
    error: int


class ServiceStatusResponse(BaseModel):
    service: str
    version: str
    pid: int
    uptime_seconds: float
    host: str
    port: int
    sqlite_path: str
    hermes_home: str
    profiles: ServiceProfileCountsResponse
