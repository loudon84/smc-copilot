"""Experience evidence capture (PRD FR-37–FR-40)."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.errors import NotFoundError
from db.models.endpoint_sync import ExperienceEvidence
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from runtime.experience_redactor import redact_payload

EVIDENCE_TYPES = frozenset(
    {
        "workflow_trace",
        "decision_rule",
        "tool_recipe",
        "correction",
        "approval_pattern",
        "failure_lesson",
        "prompt_pattern",
        "mcp_usage",
    }
)


class ExperienceCaptureService:
    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._repo = EndpointSyncRepository(session)

    async def capture(
        self,
        *,
        evidence_type: str,
        payload: dict[str, Any],
        task_id: str | None = None,
        session_id: str | None = None,
        endpoint_id: str | None = None,
        summary: str | None = None,
        confidence: float | None = None,
        sensitivity: str = "internal",
        source_refs: list[str] | None = None,
    ) -> dict[str, Any]:
        et = evidence_type if evidence_type in EVIDENCE_TYPES else "workflow_trace"
        redacted = redact_payload(payload)
        row = ExperienceEvidence(
            endpoint_id=endpoint_id,
            task_id=task_id,
            session_id=session_id,
            evidence_type=et,
            source_refs_json=json.dumps(source_refs or [], ensure_ascii=False),
            summary=summary,
            redacted_payload_json=json.dumps(redacted, ensure_ascii=False),
            confidence=confidence,
            sensitivity=sensitivity,
        )
        await self._repo.add_evidence(row)
        return self._to_dict(row)

    async def list_evidence(self) -> list[dict[str, Any]]:
        return [self._to_dict(r) for r in await self._repo.list_evidence()]

    async def get_evidence(self, evidence_id: str) -> dict[str, Any]:
        row = await self._repo.get_evidence(evidence_id)
        if row is None:
            raise NotFoundError("evidence not found")
        return self._to_dict(row)

    async def delete_evidence(self, evidence_id: str) -> None:
        ok = await self._repo.delete_evidence(evidence_id)
        if not ok:
            raise NotFoundError("evidence not found")

    def _to_dict(self, row: ExperienceEvidence) -> dict[str, Any]:
        return {
            "id": row.id,
            "evidenceType": row.evidence_type,
            "taskId": row.task_id,
            "summary": row.summary,
            "sensitivity": row.sensitivity,
            "confidence": row.confidence,
            "payload": json.loads(row.redacted_payload_json),
            "createdAt": row.created_at.isoformat() if row.created_at else None,
        }
