"""Experience API schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ExperienceCandidateCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    candidate_type: str = Field(default="sop", alias="candidateType")
    title: str
    summary: str | None = None
    evidence_refs: list[str] = Field(default_factory=list, alias="evidenceRefs")
    scope_suggestion: dict[str, Any] = Field(default_factory=dict, alias="scopeSuggestion")
    content: dict[str, Any] = Field(default_factory=dict)
    sensitivity: str = "internal"
    endpoint_id: str | None = Field(default=None, alias="endpointId")


class ExperienceCandidatePatchRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str | None = None
    summary: str | None = None
    content: dict[str, Any] | None = None
    status: str | None = None
    sensitivity: str | None = None
