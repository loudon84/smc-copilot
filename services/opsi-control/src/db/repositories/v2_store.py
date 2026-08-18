"""V2 managed endpoint repositories."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from db.models import ClientSnapshotRow, ConfigArtifactRow, HermesReleaseRow, V2ArtifactRow


@dataclass
class HermesReleaseRecord:
    release_version: str
    hermes_version: str
    smc_revision: str
    sha256: str
    manifest_sha256: str
    signer_key_id: str
    artifact_id: str
    live_eligible: bool = False
    payload_json: str = "{}"
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class ConfigArtifactRecord:
    revision: int
    sha256: str
    artifact_id: str
    payload_json: str
    created_by: str = ""
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class V2ArtifactRecord:
    artifact_id: str
    artifact_type: str
    request_id: str = ""
    client_id: str = ""
    sha256: str = ""
    size_bytes: int = 0
    status: str = "pending"
    payload_json: str = "{}"
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime | None = None


@dataclass
class ClientSnapshotRecord:
    client_id: str
    reachable: bool = False
    payload_json: str = "{}"
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class V2Store(Protocol):
    async def put_release(self, record: HermesReleaseRecord) -> None: ...
    async def get_release(self, release_version: str) -> HermesReleaseRecord | None: ...
    async def put_config(self, record: ConfigArtifactRecord) -> None: ...
    async def get_config(self, revision: int) -> ConfigArtifactRecord | None: ...
    async def put_artifact(self, record: V2ArtifactRecord) -> None: ...
    async def get_artifact(self, artifact_id: str) -> V2ArtifactRecord | None: ...
    async def put_snapshot(self, record: ClientSnapshotRecord) -> None: ...
    async def get_snapshot(self, client_id: str) -> ClientSnapshotRecord | None: ...


class MemoryV2Store:
    def __init__(self) -> None:
        self.releases: dict[str, HermesReleaseRecord] = {}
        self.configs: dict[int, ConfigArtifactRecord] = {}
        self.artifacts: dict[str, V2ArtifactRecord] = {}
        self.snapshots: dict[str, ClientSnapshotRecord] = {}

    async def put_release(self, record: HermesReleaseRecord) -> None:
        self.releases[record.release_version] = record

    async def get_release(self, release_version: str) -> HermesReleaseRecord | None:
        return self.releases.get(release_version)

    async def put_config(self, record: ConfigArtifactRecord) -> None:
        self.configs[record.revision] = record

    async def get_config(self, revision: int) -> ConfigArtifactRecord | None:
        return self.configs.get(revision)

    async def put_artifact(self, record: V2ArtifactRecord) -> None:
        self.artifacts[record.artifact_id] = record

    async def get_artifact(self, artifact_id: str) -> V2ArtifactRecord | None:
        return self.artifacts.get(artifact_id)

    async def put_snapshot(self, record: ClientSnapshotRecord) -> None:
        self.snapshots[record.client_id] = record

    async def get_snapshot(self, client_id: str) -> ClientSnapshotRecord | None:
        return self.snapshots.get(client_id)


class SqlV2Store:
    def __init__(self, factory: async_sessionmaker[AsyncSession]) -> None:
        self._factory = factory

    async def put_release(self, record: HermesReleaseRecord) -> None:
        async with self._factory() as session:
            row = (
                await session.execute(
                    select(HermesReleaseRow).where(HermesReleaseRow.release_version == record.release_version)
                )
            ).scalar_one_or_none()
            if row is None:
                row = HermesReleaseRow(release_version=record.release_version)
                session.add(row)
            row.hermes_version = record.hermes_version
            row.smc_revision = record.smc_revision
            row.sha256 = record.sha256
            row.manifest_sha256 = record.manifest_sha256
            row.signer_key_id = record.signer_key_id
            row.artifact_id = record.artifact_id
            row.live_eligible = record.live_eligible
            row.payload_json = record.payload_json
            row.created_at = record.created_at
            await session.commit()

    async def get_release(self, release_version: str) -> HermesReleaseRecord | None:
        async with self._factory() as session:
            row = (
                await session.execute(
                    select(HermesReleaseRow).where(HermesReleaseRow.release_version == release_version)
                )
            ).scalar_one_or_none()
            if row is None:
                return None
            return HermesReleaseRecord(
                release_version=row.release_version,
                hermes_version=row.hermes_version,
                smc_revision=row.smc_revision,
                sha256=row.sha256,
                manifest_sha256=row.manifest_sha256,
                signer_key_id=row.signer_key_id,
                artifact_id=row.artifact_id,
                live_eligible=row.live_eligible,
                payload_json=row.payload_json,
                created_at=row.created_at,
            )

    async def put_config(self, record: ConfigArtifactRecord) -> None:
        async with self._factory() as session:
            row = await session.get(ConfigArtifactRow, record.revision)
            if row is None:
                row = ConfigArtifactRow(revision=record.revision)
                session.add(row)
            row.sha256 = record.sha256
            row.artifact_id = record.artifact_id
            row.payload_json = record.payload_json
            row.created_by = record.created_by
            row.created_at = record.created_at
            await session.commit()

    async def get_config(self, revision: int) -> ConfigArtifactRecord | None:
        async with self._factory() as session:
            row = await session.get(ConfigArtifactRow, revision)
            if row is None:
                return None
            return ConfigArtifactRecord(
                revision=row.revision,
                sha256=row.sha256,
                artifact_id=row.artifact_id,
                payload_json=row.payload_json,
                created_by=row.created_by,
                created_at=row.created_at,
            )

    async def put_artifact(self, record: V2ArtifactRecord) -> None:
        async with self._factory() as session:
            row = await session.get(V2ArtifactRow, record.artifact_id)
            if row is None:
                row = V2ArtifactRow(artifact_id=record.artifact_id)
                session.add(row)
            row.artifact_type = record.artifact_type
            row.request_id = record.request_id
            row.client_id = record.client_id
            row.sha256 = record.sha256
            row.size_bytes = record.size_bytes
            row.status = record.status
            row.payload_json = record.payload_json
            row.created_at = record.created_at
            row.expires_at = record.expires_at
            await session.commit()

    async def get_artifact(self, artifact_id: str) -> V2ArtifactRecord | None:
        async with self._factory() as session:
            row = await session.get(V2ArtifactRow, artifact_id)
            if row is None:
                return None
            return V2ArtifactRecord(
                artifact_id=row.artifact_id,
                artifact_type=row.artifact_type,
                request_id=row.request_id,
                client_id=row.client_id,
                sha256=row.sha256,
                size_bytes=row.size_bytes,
                status=row.status,
                payload_json=row.payload_json,
                created_at=row.created_at,
                expires_at=row.expires_at,
            )

    async def put_snapshot(self, record: ClientSnapshotRecord) -> None:
        async with self._factory() as session:
            row = await session.get(ClientSnapshotRow, record.client_id)
            if row is None:
                row = ClientSnapshotRow(client_id=record.client_id)
                session.add(row)
            row.reachable = record.reachable
            row.payload_json = record.payload_json
            row.updated_at = record.updated_at
            await session.commit()

    async def get_snapshot(self, client_id: str) -> ClientSnapshotRecord | None:
        async with self._factory() as session:
            row = await session.get(ClientSnapshotRow, client_id)
            if row is None:
                return None
            return ClientSnapshotRecord(
                client_id=row.client_id,
                reachable=row.reachable,
                payload_json=row.payload_json,
                updated_at=row.updated_at,
            )


def snapshot_payload(record: ClientSnapshotRecord) -> dict[str, Any]:
    payload = json.loads(record.payload_json or "{}")
    payload.setdefault("clientId", record.client_id)
    payload["reachable"] = record.reachable
    return payload
