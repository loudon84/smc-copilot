from __future__ import annotations

from typing import Any

from schemas.common import CamelModel


class RolloutCreateRequest(CamelModel):
    component: str
    version: str
    ring: str
    request_id: str
    filters: dict[str, Any] = {}
    thresholds: dict[str, Any] = {}
    reason: str = ""


class RolloutActionRequest(CamelModel):
    request_id: str
    reason: str


class RolloutApprovalRequest(CamelModel):
    request_id: str
    reason: str = ""
    decision: str = "approve"  # approve | reject


class RolloutResponse(CamelModel):
    rollout_id: str
    component: str
    version: str
    ring: str
    state: str
    target_count: int = 0
    completed_count: int = 0
    success_rate: float = 0.0
    failure_rate: float = 0.0
    rollback_rate: float = 0.0
    p0_count: int = 0
    p1_count: int = 0
    thresholds: dict[str, Any] = {}
    batch_size: int = 0
    approval_required: bool = True
