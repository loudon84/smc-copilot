"""Experience evidence/candidate local API (PRD §18.4)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db_session, get_service_center
from core.config import Settings, get_settings
from integrations.service_center.protocol import ServiceCenterClient
from schemas.experience import ExperienceCandidateCreateRequest, ExperienceCandidatePatchRequest
from services.experience_candidate_service import ExperienceCandidateService
from services.experience_capture_service import ExperienceCaptureService
from services.staffdeck_bridge_service import StaffDeckBridgeService

router = APIRouter(prefix="/experience", tags=["experience"])


def _capture(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> ExperienceCaptureService:
    return ExperienceCaptureService(settings, session)


def _candidates(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> ExperienceCandidateService:
    return ExperienceCandidateService(settings, session)


def _bridge(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    center: ServiceCenterClient = Depends(get_service_center),
) -> StaffDeckBridgeService:
    return StaffDeckBridgeService(settings, session, center)


@router.get("/evidence")
async def list_evidence(svc: ExperienceCaptureService = Depends(_capture)) -> list[dict[str, Any]]:
    return await svc.list_evidence()


@router.get("/evidence/{evidence_id}")
async def get_evidence(
    evidence_id: str,
    svc: ExperienceCaptureService = Depends(_capture),
) -> dict[str, Any]:
    return await svc.get_evidence(evidence_id)


@router.delete("/evidence/{evidence_id}", status_code=204)
async def delete_evidence(
    evidence_id: str,
    svc: ExperienceCaptureService = Depends(_capture),
) -> Response:
    await svc.delete_evidence(evidence_id)
    return Response(status_code=204)


@router.get("/candidates")
async def list_candidates(svc: ExperienceCandidateService = Depends(_candidates)) -> list[dict[str, Any]]:
    return await svc.list_candidates()


@router.post("/candidates")
async def create_candidate(
    body: ExperienceCandidateCreateRequest,
    svc: ExperienceCandidateService = Depends(_candidates),
) -> dict[str, Any]:
    return await svc.create(
        {
            "candidateType": body.candidate_type,
            "title": body.title,
            "summary": body.summary,
            "evidenceRefs": body.evidence_refs,
            "scopeSuggestion": body.scope_suggestion,
            "content": body.content,
            "sensitivity": body.sensitivity,
            "endpointId": body.endpoint_id,
        }
    )


@router.patch("/candidates/{candidate_id}")
async def patch_candidate(
    candidate_id: str,
    body: ExperienceCandidatePatchRequest,
    svc: ExperienceCandidateService = Depends(_candidates),
) -> dict[str, Any]:
    return await svc.patch(candidate_id, body.model_dump(exclude_unset=True, by_alias=True))


@router.delete("/candidates/{candidate_id}", status_code=204)
async def delete_candidate(
    candidate_id: str,
    svc: ExperienceCandidateService = Depends(_candidates),
) -> Response:
    await svc.delete(candidate_id)
    return Response(status_code=204)


@router.post("/candidates/{candidate_id}/submit")
async def submit_candidate(
    candidate_id: str,
    svc: ExperienceCandidateService = Depends(_candidates),
    bridge: StaffDeckBridgeService = Depends(_bridge),
) -> dict[str, Any]:
    current = await svc.get(candidate_id)
    if current["status"] == "draft":
        await svc.patch(candidate_id, {"status": "local_review"})
        await svc.patch(candidate_id, {"status": "approved_for_submit"})
    elif current["status"] == "local_review":
        await svc.patch(candidate_id, {"status": "approved_for_submit"})
    return await bridge.submit(candidate_id)
