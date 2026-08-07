"""Endpoint identity API schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class EnrollmentStartRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enrollment_code: str = Field(alias="enrollmentCode")
    user_id: str | None = Field(default=None, alias="userId")


class EnrollmentCompleteRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enrollment_code: str = Field(alias="enrollmentCode")
    enrollment_id: str | None = Field(default=None, alias="enrollmentId")
    user_id: str | None = Field(default=None, alias="userId")
    tenant_hint: str | None = Field(default=None, alias="tenantHint")
