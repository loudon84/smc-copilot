from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class RequestContext:
    tenant_id: UUID
    workspace_id: UUID
    user_id: UUID
    roles: list[UUID]
    departments: list[UUID]
