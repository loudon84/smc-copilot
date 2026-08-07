from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.documents.models import DocumentPermission
from app.modules.documents.repository import DocumentRepository


ROLE_ORDER: dict[str, int] = {"view": 1, "edit": 2, "owner": 3}


class PermissionService:
    def __init__(self, repo: DocumentRepository) -> None:
        self._repo = repo

    async def get_user_role(
        self,
        session: AsyncSession,
        *,
        document_id: UUID,
        user_id: UUID,
        roles: list[UUID],
        departments: list[UUID],
    ) -> str | None:
        perms = await self._repo.list_permissions(session, document_id=document_id)
        best: str | None = None

        def consider(role: str) -> None:
            nonlocal best
            if best is None or ROLE_ORDER[role] > ROLE_ORDER[best]:
                best = role

        for p in perms:
            if p.role == "owner" and p.subject_type == "user" and p.subject_id == user_id:
                consider("owner")

        for p in perms:
            if p.subject_type == "user" and p.subject_id == user_id:
                consider(p.role)

        role_set = set(roles)
        dept_set = set(departments)
        for p in perms:
            if p.subject_type == "role" and p.subject_id in role_set:
                consider(p.role)
            if p.subject_type == "department" and p.subject_id in dept_set:
                consider(p.role)

        return best

    @staticmethod
    def can_view(role: str | None) -> bool:
        return role in ("view", "edit", "owner")

    @staticmethod
    def can_edit(role: str | None) -> bool:
        return role in ("edit", "owner")

    @staticmethod
    def can_owner(role: str | None) -> bool:
        return role == "owner"
