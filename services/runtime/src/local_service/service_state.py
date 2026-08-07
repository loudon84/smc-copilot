from __future__ import annotations

import os
import time
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.constants import GatewayStatus
from db.models.profile import Profile
from version import __version__


@dataclass(frozen=True)
class ServiceProfileCounts:
    total: int
    running: int
    error: int


@dataclass(frozen=True)
class ServiceRuntimeStatus:
    service: str
    version: str
    pid: int
    uptime_seconds: float
    host: str
    port: int
    sqlite_path: str
    hermes_home: str
    profiles: ServiceProfileCounts


_boot_monotonic: float | None = None


def mark_service_boot() -> None:
    global _boot_monotonic
    _boot_monotonic = time.monotonic()


def get_uptime_seconds() -> float:
    if _boot_monotonic is None:
        return 0.0
    return max(0.0, time.monotonic() - _boot_monotonic)


async def collect_profile_counts(session_maker: async_sessionmaker[AsyncSession]) -> ServiceProfileCounts:
    async with session_maker() as session:
        total = int(await session.scalar(select(func.count()).select_from(Profile)) or 0)
        running = int(
            await session.scalar(
                select(func.count()).select_from(Profile).where(Profile.status == GatewayStatus.RUNNING.value)
            )
            or 0
        )
        error = int(
            await session.scalar(
                select(func.count()).select_from(Profile).where(Profile.status == GatewayStatus.ERROR.value)
            )
            or 0
        )
    return ServiceProfileCounts(total=total, running=running, error=error)


async def build_service_status(
    settings: Settings,
    session_maker: async_sessionmaker[AsyncSession],
) -> ServiceRuntimeStatus:
    counts = await collect_profile_counts(session_maker)
    return ServiceRuntimeStatus(
        service="HermesLocalService",
        version=__version__,
        pid=os.getpid(),
        uptime_seconds=get_uptime_seconds(),
        host=settings.bind_host,
        port=settings.bind_port,
        sqlite_path=settings.sqlite_path,
        hermes_home=str(settings.hermes_home_path),
        profiles=counts,
    )
