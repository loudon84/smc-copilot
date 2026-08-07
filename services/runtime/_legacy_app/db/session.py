from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings, require_postgres_dsn


def create_engine() -> AsyncEngine:
    settings = get_settings()
    return create_async_engine(require_postgres_dsn(settings), pool_pre_ping=True)


def create_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def session_scope(session_maker: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    session = session_maker()
    try:
        yield session
    finally:
        await session.close()
