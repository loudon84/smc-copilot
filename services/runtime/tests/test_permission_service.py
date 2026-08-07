from __future__ import annotations

import asyncio
from uuid import uuid4

from app.modules.documents.models import DocumentPermission
from app.modules.documents.permission import PermissionService


class _FakeRepo:
    def __init__(self, perms: list[DocumentPermission]) -> None:
        self._perms = perms

    async def list_permissions(self, _session, *, document_id):  # noqa: ANN001
        return [p for p in self._perms if p.document_id == document_id]


def test_permission_resolution_precedence_owner_over_role_and_dept() -> None:
    document_id = uuid4()
    user_id = uuid4()
    role_id = uuid4()
    dept_id = uuid4()

    perms = [
        DocumentPermission(document_id=document_id, subject_type="role", subject_id=role_id, role="edit", created_by=uuid4()),
        DocumentPermission(document_id=document_id, subject_type="department", subject_id=dept_id, role="edit", created_by=uuid4()),
        DocumentPermission(document_id=document_id, subject_type="user", subject_id=user_id, role="owner", created_by=uuid4()),
    ]

    svc = PermissionService(_FakeRepo(perms))  # type: ignore[arg-type]
    role = asyncio.run(
        svc.get_user_role(
            None,
            document_id=document_id,
            user_id=user_id,
            roles=[role_id],
            departments=[dept_id],
        )
    )
    assert role == "owner"


def test_permission_resolution_user_direct_over_dept_and_role() -> None:
    document_id = uuid4()
    user_id = uuid4()
    role_id = uuid4()
    dept_id = uuid4()

    perms = [
        DocumentPermission(document_id=document_id, subject_type="role", subject_id=role_id, role="owner", created_by=uuid4()),
        DocumentPermission(document_id=document_id, subject_type="department", subject_id=dept_id, role="owner", created_by=uuid4()),
        DocumentPermission(document_id=document_id, subject_type="user", subject_id=user_id, role="edit", created_by=uuid4()),
    ]

    svc = PermissionService(_FakeRepo(perms))  # type: ignore[arg-type]
    role = asyncio.run(
        svc.get_user_role(
            None,
            document_id=document_id,
            user_id=user_id,
            roles=[role_id],
            departments=[dept_id],
        )
    )
    assert role == "owner"


def test_permission_resolution_returns_none_when_no_match() -> None:
    document_id = uuid4()
    user_id = uuid4()
    other_user = uuid4()

    perms = [
        DocumentPermission(document_id=document_id, subject_type="user", subject_id=other_user, role="view", created_by=uuid4()),
    ]

    svc = PermissionService(_FakeRepo(perms))  # type: ignore[arg-type]
    role = asyncio.run(svc.get_user_role(None, document_id=document_id, user_id=user_id, roles=[], departments=[]))
    assert role is None
