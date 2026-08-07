"""StaffDeck bridge via Service Center (PRD FR-43–FR-44)."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.enums import ExperienceCandidateStatus
from core.errors import ConflictError, NotFoundError
from db.models.endpoint_sync import ExperienceSubmissionRecord
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from integrations.service_center.protocol import ServiceCenterClient
from services.endpoint_enrollment_service import EndpointEnrollmentService
from services.experience_candidate_service import ExperienceCandidateService


# @lat: [[endpoint-sync#Experience]]
class StaffDeckBridgeService:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        center: ServiceCenterClient,
    ) -> None:
        self._settings = settings
        self._repo = EndpointSyncRepository(session)
        self._center = center
        self._enrollment = EndpointEnrollmentService(settings, session, center)
        self._candidates = ExperienceCandidateService(settings, session)

    async def submit(self, candidate_id: str) -> dict[str, Any]:
        row = await self._repo.get_candidate(candidate_id)
        if row is None:
            raise NotFoundError("candidate not found")
        if row.status != ExperienceCandidateStatus.APPROVED_FOR_SUBMIT.value:
            raise ConflictError("user approval required before StaffDeck submit")

        cred = await self._enrollment.ensure_access_token()
        payload = {
            "candidateId": row.id,
            "candidateType": row.candidate_type,
            "title": row.title,
            "summary": row.summary,
            "content": json.loads(row.content_json or "{}"),
            "evidenceRefs": json.loads(row.evidence_refs_json or "[]"),
            "sensitivity": row.sensitivity,
        }
        resp = await self._center.submit_experience_candidate(cred.endpoint_id, payload)
        await self._candidates.mark_submitted(candidate_id)
        submission = ExperienceSubmissionRecord(
            candidate_id=candidate_id,
            submission_id=str(resp.get("submissionId") or ""),
            center_status=str(resp.get("status") or "received"),
            response_json=json.dumps(resp, ensure_ascii=False),
        )
        await self._repo.add_submission(submission)
        return {
            "candidateId": candidate_id,
            "status": ExperienceCandidateStatus.SUBMITTED.value,
            "submissionId": submission.submission_id,
            "centerStatus": submission.center_status,
        }

    async def sync_reviews(self) -> list[dict[str, Any]]:
        cred = await self._enrollment.ensure_access_token()
        reviews = await self._center.get_experience_reviews(cred.endpoint_id)
        applied: list[dict[str, Any]] = []
        for item in reviews:
            row = await self._repo.get_candidate(item.candidate_id)
            if row is None:
                continue
            # Center may set accepted/rejected/published; runtime never invents these itself
            if item.status in {
                ExperienceCandidateStatus.ACCEPTED.value,
                ExperienceCandidateStatus.REJECTED.value,
                ExperienceCandidateStatus.PUBLISHED.value,
            }:
                row.status = item.status
            for sub in await self._repo.list_submissions_for_candidate(row.id):
                sub.center_status = item.status
                sub.response_json = json.dumps(item.detail, ensure_ascii=False)
            applied.append({"candidateId": row.id, "status": row.status})
        return applied
