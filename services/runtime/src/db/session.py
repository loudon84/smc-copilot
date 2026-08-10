from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from core.config import Settings
from db.base import Base


def create_engine(settings: Settings) -> AsyncEngine:
    is_sqlite = "sqlite" in settings.sqlite_url
    # aiosqlite 连接级超时：写事务竞争时等待而非立即 database is locked
    connect_args = {"timeout": 30} if is_sqlite else {}
    engine = create_async_engine(settings.sqlite_url, echo=False, connect_args=connect_args)

    if is_sqlite:

        @event.listens_for(engine.sync_engine, "connect")  # type: ignore[untyped-decorator]
        def _sqlite_pragma(dbapi_connection: object, _connection_record: object) -> None:
            cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
            cursor.execute("PRAGMA foreign_keys=ON")
            # WAL 允许读写在多数情况下并发；busy_timeout 兜底等待残留写锁
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA busy_timeout=10000")
            cursor.close()

    return engine


def create_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def init_db(engine: AsyncEngine) -> None:
    """仅用于测试：生产 schema 请使用 ``alembic upgrade head``。"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session(session_maker: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    session = session_maker()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
