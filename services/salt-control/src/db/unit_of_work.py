from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from db.repositories.interfaces import RepositoryBundle
from db.repositories.sqlalchemy import build_sqlalchemy_repos


class UnitOfWork:
    """Transactional boundary for production PostgreSQL repositories."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repos: RepositoryBundle = build_sqlalchemy_repos(session)

    async def commit(self) -> None:
        await self.session.commit()

    async def rollback(self) -> None:
        await self.session.rollback()


@asynccontextmanager
async def unit_of_work(factory: async_sessionmaker[AsyncSession]) -> AsyncIterator[UnitOfWork]:
    session = factory()
    uow = UnitOfWork(session)
    try:
        yield uow
        await uow.commit()
    except Exception:
        await uow.rollback()
        raise
    finally:
        await session.close()
