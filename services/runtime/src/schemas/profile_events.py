from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class ProfileEventResponse(BaseModel):
    id: str
    source: Literal["task", "audit"]
    event_type: str
    task_id: str | None = None
    message: str | None = None
    event_payload: str | None = None
    created_at: datetime
