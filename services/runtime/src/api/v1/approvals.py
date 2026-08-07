from __future__ import annotations

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_approval_service, get_db_session
from core.errors import NotFoundError
from db.repositories.v12_repos import ApprovalRepository
from schemas.v12_tasks import ApprovalApproveBody, ApprovalRejectBody, ApprovalResponse
from services.approval_service import ApprovalService

router = APIRouter(prefix="/approvals", tags=["approvals"])


@router.get("", response_model=list[ApprovalResponse])
async def list_approvals(
    session: AsyncSession = Depends(get_db_session),
    limit: int = 200,
) -> list[ApprovalResponse]:
    rows = await ApprovalRepository(session).list_all(limit=limit)
    return [ApprovalResponse.model_validate(r) for r in rows]


@router.get("/pending", response_model=list[ApprovalResponse])
async def list_pending_approvals(session: AsyncSession = Depends(get_db_session)) -> list[ApprovalResponse]:
    rows = await ApprovalRepository(session).list_pending()
    return [ApprovalResponse.model_validate(r) for r in rows]


@router.get("/{approval_id}", response_model=ApprovalResponse)
async def get_approval(
    approval_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> ApprovalResponse:
    row = await ApprovalRepository(session).get(approval_id)
    if row is None:
        raise NotFoundError("Approval not found")
    return ApprovalResponse.model_validate(row)


@router.post("/{approval_id}/approve", response_model=ApprovalResponse)
async def approve(
    approval_id: str,
    body: ApprovalApproveBody | None = Body(default=None),
    approvals: ApprovalService = Depends(get_approval_service),
) -> ApprovalResponse:
    row = await approvals.approve(approval_id, approved_by=body.approved_by if body else None)
    return ApprovalResponse.model_validate(row)


@router.post("/{approval_id}/reject", response_model=ApprovalResponse)
async def reject(
    approval_id: str,
    body: ApprovalRejectBody | None = Body(default=None),
    approvals: ApprovalService = Depends(get_approval_service),
) -> ApprovalResponse:
    row = await approvals.reject(
        approval_id, actor=body.actor if body else None, reason=body.reason if body else None
    )
    return ApprovalResponse.model_validate(row)
