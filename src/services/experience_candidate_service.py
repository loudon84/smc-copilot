"""Experience candidate local review (PRD FR-41–FR-42). Local max publish state is submitted."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.enums import ExperienceCandidateStatus
from core.errors import ConflictError, CopilotError, NotFoundError
from db.models.endpoint_sync import ExperienceCandidate
from db.repositories.endpoint_sync_repo import EndpointSyncRepository

if TYPE_CHECKING:
    from services.staffdeck_bridge_service import StaffDeckBridgeService

_TERMINAL_FROM_CENTER = {
    ExperienceCandidateStatus.ACCEPTED.value,
    ExperienceCandidateStatus.REJECTED.value,
    ExperienceCandidateStatus.PUBLISHED.value,
}


class ExperienceCandidateService:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        bridge: StaffDeckBridgeService | None = None,
    ) -> None:
        self._settings = settings
        self._repo = EndpointSyncRepository(session)
        self._bridge = bridge

    def _to_dict(self, row: ExperienceCandidate) -> dict[str, Any]:
        return {
            "id": row.id,
            "candidateType": row.candidate_type,
            "title": row.title,
            "summary": row.summary,
            "status": row.status,
            "sensitivity": row.sensitivity,
            "evidenceRefs": json.loads(row.evidence_refs_json or "[]"),
            "content": json.loads(row.content_json or "{}"),
            "createdAt": row.created_at.isoformat() if row.created_at else None,
            "submittedAt": row.submitted_at.isoformat() if row.submitted_at else None,
        }

    async def create(self, body: dict[str, Any]) -> dict[str, Any]:
        status = str(body.get("status") or ExperienceCandidateStatus.DRAFT.value)
        if status in _TERMINAL_FROM_CENTER:
            raise CopilotError("runtime cannot set candidate to published/accepted", code="invalid_status")
        row = ExperienceCandidate(
            endpoint_id=body.get("endpoint_id") or body.get("endpointId"),
            candidate_type=str(
                body.get("candidate_type") or body.get("candidateType") or "skill_candidate"
            ),
            title=str(body.get("title") or "untitled"),
            summary=body.get("summary"),
            status=status,
            evidence_refs_json=json.dumps(
                body.get("evidence_refs") or body.get("evidenceRefs") or [], ensure_ascii=False
            ),
            scope_suggestion_json=json.dumps(
                body.get("scope_suggestion") or body.get("scopeSuggestion") or {}, ensure_ascii=False
            ),
            content_json=json.dumps(body.get("content") or {}, ensure_ascii=False),
            sensitivity=str(body.get("sensitivity") or "internal"),
        )
        await self._repo.add_candidate(row)
        return self._to_dict(row)

    async def list_candidates(self) -> list[dict[str, Any]]:
        return [self._to_dict(r) for r in await self._repo.list_candidates()]

    async def get(self, candidate_id: str) -> dict[str, Any]:
        row = await self._repo.get_candidate(candidate_id)
        if row is None:
            raise NotFoundError("candidate not found")
        return self._to_dict(row)

    async def update(self, candidate_id: str, body: dict[str, Any]) -> dict[str, Any]:
        return await self.patch(candidate_id, body)

    async def patch(self, candidate_id: str, body: dict[str, Any]) -> dict[str, Any]:
        row = await self._repo.get_candidate(candidate_id)
        if row is None:
            raise NotFoundError("candidate not found")
        if row.status == ExperienceCandidateStatus.SUBMITTED.value:
            raise ConflictError("submitted candidates are immutable locally")
        if "title" in body and body["title"] is not None:
            row.title = str(body["title"])
        if "summary" in body:
            row.summary = body.get("summary")
        if "content" in body and body["content"] is not None:
            row.content_json = json.dumps(body["content"], ensure_ascii=False)
        if "sensitivity" in body and body["sensitivity"] is not None:
            row.sensitivity = str(body["sensitivity"])
        if "status" in body and body["status"] is not None:
            new_status = str(body["status"])
            if new_status in _TERMINAL_FROM_CENTER:
                raise CopilotError("only StaffDeck/center may set accepted/published", code="invalid_status")
            allowed = {
                ExperienceCandidateStatus.DRAFT.value,
                ExperienceCandidateStatus.LOCAL_REVIEW.value,
                ExperienceCandidateStatus.APPROVED_FOR_SUBMIT.value,
            }
            if new_status not in allowed:
                raise CopilotError(f"invalid local status transition to {new_status}", code="invalid_status")
            row.status = new_status
        return self._to_dict(row)

    async def delete(self, candidate_id: str) -> None:
        row = await self._repo.get_candidate(candidate_id)
        if row is None:
            raise NotFoundError("candidate not found")
        if row.status == ExperienceCandidateStatus.SUBMITTED.value:
            raise ConflictError("cannot delete submitted candidate")
        await self._repo.delete_candidate(candidate_id)

    async def mark_submitted(self, candidate_id: str) -> ExperienceCandidate:
        row = await self._repo.get_candidate(candidate_id)
        if row is None:
            raise NotFoundError("candidate not found")
        if row.status != ExperienceCandidateStatus.APPROVED_FOR_SUBMIT.value:
            raise ConflictError("candidate must be approved_for_submit before submit")
        row.status = ExperienceCandidateStatus.SUBMITTED.value
        row.submitted_at = datetime.now(UTC)
        return row

    async def submit(self, candidate_id: str) -> dict[str, Any]:
        if self._bridge is None:
            raise CopilotError("StaffDeck bridge not configured", code="bridge_missing")
        return await self._bridge.submit(candidate_id)
