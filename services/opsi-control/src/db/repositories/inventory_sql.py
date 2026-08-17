from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from db.models import ControllerEvidenceRow, EndpointBindingRow, EndpointInventoryRow, ProductReleaseRow, ResultAckRow
from domain.collector import InventoryStore
from domain.inventory import EndpointBindingRecord, EndpointInventorySnapshot


def _snapshot_from_row(row: EndpointInventoryRow) -> EndpointInventorySnapshot:
    return EndpointInventorySnapshot(
        client_id=row.client_id,
        os=row.os,
        last_seen_minutes=row.last_seen_minutes,
        owner=row.owner,
        disk_free_mb=row.disk_free_mb,
        user_sid=row.user_sid,
        user_account=row.user_account,
        binding_source=row.binding_source,
        binding_observed_at=row.binding_observed_at,
        gateway_healthy=row.gateway_healthy,
        previous_version=row.previous_version,
        previous_digest=row.previous_digest,
        depot_id=row.depot_id,
        observed_at=row.observed_at,
        source=row.source,
        baseline_kind=row.baseline_kind,
        content_digest=row.content_digest,
        expiry=row.expiry,
        cli_path=row.cli_path,
        cli_version=row.cli_version,
        bootstrap_task=row.bootstrap_task,
        gateway_task=row.gateway_task,
        trust_level=row.trust_level,
    )


class SqlInventoryStore(InventoryStore):
    def __init__(self, factory: async_sessionmaker[AsyncSession]) -> None:
        self.factory = factory

    async def get_snapshot(self, client_id: str) -> EndpointInventorySnapshot | None:
        async with self.factory() as session:
            row = await session.get(EndpointInventoryRow, client_id)
            if row is None:
                return None
            snap = _snapshot_from_row(row)
            if snap.expired():
                return None
            return snap

    async def put_snapshot(self, snapshot: EndpointInventorySnapshot) -> None:
        async with self.factory() as session:
            async with session.begin():
                row = await session.get(EndpointInventoryRow, snapshot.client_id)
                if row is None:
                    session.add(
                        EndpointInventoryRow(
                            client_id=snapshot.client_id,
                            os=snapshot.os,
                            last_seen_minutes=snapshot.last_seen_minutes,
                            owner=snapshot.owner,
                            disk_free_mb=snapshot.disk_free_mb,
                            user_sid=snapshot.user_sid,
                            user_account=snapshot.user_account,
                            binding_source=snapshot.binding_source,
                            binding_observed_at=snapshot.binding_observed_at,
                            gateway_healthy=snapshot.gateway_healthy,
                            previous_version=snapshot.previous_version,
                            previous_digest=snapshot.previous_digest,
                            depot_id=snapshot.depot_id,
                            observed_at=snapshot.observed_at,
                            source=snapshot.source,
                            baseline_kind=snapshot.baseline_kind,
                            content_digest=snapshot.content_digest,
                            expiry=snapshot.expiry,
                            cli_path=snapshot.cli_path,
                            cli_version=snapshot.cli_version,
                            bootstrap_task=snapshot.bootstrap_task,
                            gateway_task=snapshot.gateway_task,
                            trust_level=snapshot.trust_level,
                            evidence_json="{}",
                        )
                    )
                    return
                row.os = snapshot.os
                row.last_seen_minutes = snapshot.last_seen_minutes
                row.owner = snapshot.owner
                row.disk_free_mb = snapshot.disk_free_mb
                row.user_sid = snapshot.user_sid
                row.user_account = snapshot.user_account
                row.binding_source = snapshot.binding_source
                row.binding_observed_at = snapshot.binding_observed_at
                row.gateway_healthy = snapshot.gateway_healthy
                row.previous_version = snapshot.previous_version
                row.previous_digest = snapshot.previous_digest
                row.depot_id = snapshot.depot_id
                row.observed_at = snapshot.observed_at
                row.source = snapshot.source
                row.baseline_kind = snapshot.baseline_kind
                row.content_digest = snapshot.content_digest
                row.expiry = snapshot.expiry
                row.cli_path = snapshot.cli_path
                row.cli_version = snapshot.cli_version
                row.bootstrap_task = snapshot.bootstrap_task
                row.gateway_task = snapshot.gateway_task
                row.trust_level = snapshot.trust_level

    async def delete_snapshot(self, client_id: str) -> None:
        async with self.factory() as session:
            async with session.begin():
                row = await session.get(EndpointInventoryRow, client_id)
                if row:
                    await session.delete(row)

    async def get_binding(self, client_id: str) -> EndpointBindingRecord | None:
        async with self.factory() as session:
            row = await session.get(EndpointBindingRow, client_id)
            if row is None:
                return None
            return EndpointBindingRecord(
                client_id=row.client_id,
                user_sid=row.user_sid,
                user_account=row.user_account,
                evidence_ref=row.evidence_ref,
                revision=row.revision,
                approved_by=row.approved_by,
                observed_at=row.observed_at,
                reason=row.reason,
                change_ticket=row.change_ticket,
            )

    async def put_binding(self, binding: EndpointBindingRecord) -> None:
        async with self.factory() as session:
            async with session.begin():
                row = await session.get(EndpointBindingRow, binding.client_id)
                if row is None:
                    session.add(
                        EndpointBindingRow(
                            client_id=binding.client_id,
                            user_sid=binding.user_sid,
                            user_account=binding.user_account,
                            evidence_ref=binding.evidence_ref,
                            revision=binding.revision,
                            approved_by=binding.approved_by,
                            observed_at=binding.observed_at,
                            reason=binding.reason,
                            change_ticket=binding.change_ticket,
                        )
                    )
                    return
                row.user_sid = binding.user_sid
                row.user_account = binding.user_account
                row.evidence_ref = binding.evidence_ref
                row.revision = binding.revision
                row.approved_by = binding.approved_by
                row.observed_at = binding.observed_at
                row.reason = binding.reason
                row.change_ticket = binding.change_ticket

    async def get_evidence(self, client_id: str) -> dict[str, Any] | None:
        async with self.factory() as session:
            row = await session.get(EndpointInventoryRow, client_id)
            if row is None or not row.evidence_json:
                return None
            return json.loads(row.evidence_json)

    async def put_evidence(self, client_id: str, evidence: dict[str, Any]) -> None:
        async with self.factory() as session:
            async with session.begin():
                row = await session.get(EndpointInventoryRow, client_id)
                encoded = json.dumps(evidence)
                if row is None:
                    now = datetime.now(UTC)
                    session.add(
                        EndpointInventoryRow(
                            client_id=client_id,
                            os="",
                            last_seen_minutes=0,
                            owner="",
                            disk_free_mb=0,
                            user_sid="",
                            user_account="",
                            binding_source="",
                            binding_observed_at=now,
                            gateway_healthy=False,
                            previous_version="",
                            previous_digest="",
                            depot_id="",
                            observed_at=now,
                            source="pending",
                            baseline_kind="ABSENT",
                            content_digest="",
                            expiry=now,
                            evidence_json=encoded,
                        )
                    )
                    return
                row.evidence_json = encoded

    async def get_controller_evidence(self, client_id: str) -> dict[str, Any] | None:
        async with self.factory() as session:
            row = await session.get(ControllerEvidenceRow, client_id)
            if row is None:
                return None
            return json.loads(row.payload_json)

    async def put_controller_evidence(self, client_id: str, evidence: dict[str, Any]) -> None:
        async with self.factory() as session:
            async with session.begin():
                encoded = json.dumps(evidence)
                digest = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
                now = datetime.now(UTC)
                row = await session.get(ControllerEvidenceRow, client_id)
                if row is None:
                    session.add(
                        ControllerEvidenceRow(
                            client_id=client_id,
                            payload_json=encoded,
                            observed_at=now,
                            content_digest=digest,
                        )
                    )
                    return
                row.payload_json = encoded
                row.observed_at = now
                row.content_digest = digest

    async def get_result_ack(self, request_id: str, client_id: str) -> str | None:
        from sqlalchemy import select

        async with self.factory() as session:
            result = await session.execute(
                select(ResultAckRow).where(ResultAckRow.request_id == request_id, ResultAckRow.client_id == client_id)
            )
            row = result.scalar_one_or_none()
            return row.token if row else None

    async def put_result_ack(self, request_id: str, client_id: str, token: str) -> None:
        from sqlalchemy import select

        async with self.factory() as session:
            async with session.begin():
                result = await session.execute(
                    select(ResultAckRow).where(
                        ResultAckRow.request_id == request_id, ResultAckRow.client_id == client_id
                    )
                )
                row = result.scalar_one_or_none()
                if row is None:
                    session.add(ResultAckRow(request_id=request_id, client_id=client_id, token=token))
                    return
                row.token = token

    async def get_product_release(self, product_id: str) -> dict[str, Any] | None:
        from sqlalchemy import select

        async with self.factory() as session:
            result = await session.execute(
                select(ProductReleaseRow)
                .where(ProductReleaseRow.product_id == product_id)
                .order_by(ProductReleaseRow.id.desc())
            )
            row = result.scalars().first()
            if row is None:
                return None
            return json.loads(row.payload_json)

    async def put_product_release(self, product_id: str, release: dict[str, Any]) -> None:
        if release.get("liveEligible") and str(release.get("signerKeyId") or release.get("keyId") or "").startswith(
            "TEST-ONLY"
        ):
            raise ValueError("smoke release cannot be live eligible")
        async with self.factory() as session:
            async with session.begin():
                from sqlalchemy import select

                product_version = str(release.get("productVersion") or "")
                package_version = str(release.get("packageVersion") or "")
                result = await session.execute(
                    select(ProductReleaseRow).where(
                        ProductReleaseRow.product_id == product_id,
                        ProductReleaseRow.product_version == product_version,
                        ProductReleaseRow.package_version == package_version,
                    )
                )
                row = result.scalar_one_or_none()
                controller = release.get("controller") or {}
                encoded = json.dumps(release)
                values = dict(
                    controller_revision=str(controller.get("revision") or ""),
                    controller_digest=str(controller.get("bundleDigest") or ""),
                    runtime_catalog_json=json.dumps(release.get("runtimes") or []),
                    release_index_digest=str(release.get("canonicalDigest") or ""),
                    attestation_digest=str(release.get("attestationDigest") or ""),
                    depot_readback_json=json.dumps(release.get("depotReadback") or {}),
                    signer_key_id=str(release.get("signerKeyId") or ""),
                    live_eligible=bool(release.get("liveEligible")),
                    verified=bool(release.get("verified")),
                    payload_json=encoded,
                )
                if row is None:
                    session.add(
                        ProductReleaseRow(
                            product_id=product_id,
                            product_version=product_version,
                            package_version=package_version,
                            **values,
                        )
                    )
                    return
                for key, value in values.items():
                    setattr(row, key, value)
