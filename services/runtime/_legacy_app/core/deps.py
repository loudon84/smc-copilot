from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import UUID, uuid4

from fastapi import Header
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.context import RequestContext
from app.db.session import create_engine, create_sessionmaker, session_scope

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def _get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _engine, _sessionmaker
    if _sessionmaker is None:
        _engine = create_engine()
        _sessionmaker = create_sessionmaker(_engine)
    return _sessionmaker


async def get_db_session() -> AsyncIterator[AsyncSession]:
    sessionmaker = _get_sessionmaker()
    async for session in session_scope(sessionmaker):
        yield session


def _parse_uuid_list(value: str | None) -> list[UUID]:
    if not value:
        return []
    parts = [p.strip() for p in value.split(",") if p.strip()]
    return [UUID(p) for p in parts]


async def get_request_context(
    x_tenant_id: str | None = Header(default=None),
    x_workspace_id: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
    x_roles: str | None = Header(default=None),
    x_departments: str | None = Header(default=None),
) -> RequestContext:
    tenant_id = UUID(x_tenant_id) if x_tenant_id else uuid4()
    workspace_id = UUID(x_workspace_id) if x_workspace_id else uuid4()
    user_id = UUID(x_user_id) if x_user_id else uuid4()
    roles = _parse_uuid_list(x_roles)
    departments = _parse_uuid_list(x_departments)
    return RequestContext(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        user_id=user_id,
        roles=roles,
        departments=departments,
    )
