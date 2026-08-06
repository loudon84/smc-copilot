"""Endpoint enrollment orchestration (PRD FR-06–FR-09)."""

from __future__ import annotations

import hashlib
import platform
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.enums import EnrollmentStatus
from core.errors import ConflictError, CopilotError, NotFoundError
from db.models.endpoint_sync import EndpointCredential, EndpointEnrollment
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from integrations.service_center.auth import DeviceKeyStore, generate_device_keypair, sign_message
from integrations.service_center.dto import EnrollRequest
from integrations.service_center.protocol import ServiceCenterClient
from version import __version__

DEFAULT_SYNC_CHANNELS = (
    "desired_state",
    "task_assignment",
    "task_control",
    "resource_release",
    "staffdeck_review",
)


def _parse_expires(value: str) -> datetime:
    text = value.replace("Z", "+00:00")
    return datetime.fromisoformat(text)


# @lat: [[endpoint-sync#Enrollment]]
class EndpointEnrollmentService:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        center: ServiceCenterClient,
    ) -> None:
        self._settings = settings
        self._repo = EndpointSyncRepository(session)
        self._center = center
        self._keys = DeviceKeyStore(settings)

    async def status(self) -> dict[str, Any]:
        enrollment = await self._repo.get_latest_enrollment()
        cred = await self._repo.get_credential()
        return {
            "enrollmentStatus": enrollment.enrollment_status if enrollment else "unregistered",
            "endpointId": (cred.endpoint_id if cred else None)
            or (enrollment.endpoint_id if enrollment else None),
            "tenantId": (cred.tenant_id if cred else None)
            or (enrollment.tenant_id if enrollment else None),
            "revokedAt": enrollment.revoked_at.isoformat() if enrollment and enrollment.revoked_at else None,
            "accessTokenExpiresAt": (
                cred.access_token_expires_at.isoformat() if cred and cred.access_token_expires_at else None
            ),
            "syncEnabled": bool(
                cred and cred.status == "active" and enrollment and enrollment.enrollment_status == "completed"
            ),
        }

    async def start(self, *, enrollment_code: str, user_id: str | None = None) -> dict[str, Any]:
        active = await self._repo.get_active_enrollment()
        if active is not None:
            raise ConflictError("endpoint already enrolled; revoke before re-enrolling")

        code = (enrollment_code or "").strip()
        if not code:
            raise CopilotError("enrollmentCode required", code="invalid_request")

        pair = generate_device_keypair()
        machine_hash = hashlib.sha256(
            f"{platform.node()}|{platform.machine()}|{self._settings.device_id}".encode()
        ).hexdigest()

        row = EndpointEnrollment(
            enrollment_status=EnrollmentStatus.PENDING.value,
            enrollment_code_hint=code[:8],
            public_key_b64=pair.public_key_b64,
            device_id=self._settings.device_id,
            user_id=user_id,
            machine_id_hash=machine_hash,
            runtime_version=__version__,
            os_version=platform.platform(),
            architecture=platform.machine(),
        )
        await self._repo.add_enrollment(row)

        # Stash private key under pending id until complete assigns endpoint_id
        pending_key = self._keys.store_private_key(f"pending:{row.id}", pair.private_key_b64)
        return {
            "enrollmentId": row.id,
            "status": row.enrollment_status,
            "publicKey": pair.public_key_b64,
            "privateKeyStorageKey": pending_key,
            "machineIdHash": machine_hash,
        }

    async def complete(
        self,
        *,
        enrollment_code: str,
        enrollment_id: str | None = None,
        user_id: str | None = None,
        tenant_hint: str | None = None,
    ) -> dict[str, Any]:
        if enrollment_id:
            row = await self._repo.get_enrollment(enrollment_id)
        else:
            row = await self._repo.get_latest_enrollment()
        if row is None or row.enrollment_status != EnrollmentStatus.PENDING.value:
            raise NotFoundError("pending enrollment not found")
        if not row.public_key_b64:
            raise CopilotError("public key missing", code="device_key_missing")

        private_key = self._keys.load_private_key(f"endpoint:device_private_key:pending:{row.id}")
        if not private_key:
            raise CopilotError("device key missing", code="device_key_missing")

        resp = await self._center.enroll(
            EnrollRequest(
                enrollment_code=enrollment_code,
                public_key_b64=row.public_key_b64,
                device_id=row.device_id or self._settings.device_id,
                machine_id_hash=row.machine_id_hash or "",
                runtime_version=row.runtime_version or __version__,
                os_version=row.os_version or platform.platform(),
                architecture=row.architecture or platform.machine(),
                user_id=user_id or row.user_id,
                tenant_hint=tenant_hint,
            )
        )

        private_storage = self._keys.store_private_key(resp.endpoint_id, private_key)
        refresh_storage = self._keys.store_refresh_credential(resp.endpoint_id, resp.refresh_credential)
        # cleanup pending key
        self._keys.delete(f"endpoint:device_private_key:pending:{row.id}")

        cred = EndpointCredential(
            endpoint_id=resp.endpoint_id,
            tenant_id=resp.tenant_id,
            public_key_b64=row.public_key_b64,
            private_key_storage_key=private_storage,
            refresh_credential_storage_key=refresh_storage,
            access_token=resp.access_token,
            access_token_expires_at=_parse_expires(resp.access_token_expires_at),
            certificate_thumbprint=resp.certificate_thumbprint,
            status="active",
        )
        await self._repo.add_credential(cred)

        row.endpoint_id = resp.endpoint_id
        row.tenant_id = resp.tenant_id
        row.enrollment_status = EnrollmentStatus.COMPLETED.value
        row.completed_at = datetime.now(UTC)
        await self._repo.save_enrollment(row)

        for channel in DEFAULT_SYNC_CHANNELS:
            await self._repo.ensure_channel(channel)
            await self._repo.upsert_cursor(channel, "")

        return {
            "endpointId": resp.endpoint_id,
            "tenantId": resp.tenant_id,
            "status": row.enrollment_status,
            "accessTokenExpiresAt": resp.access_token_expires_at,
        }

    async def revoke(self) -> dict[str, Any]:
        enrollment = await self._repo.get_active_enrollment()
        cred = await self._repo.get_credential()
        if enrollment is None and cred is None:
            raise NotFoundError("no active enrollment")

        if cred is not None:
            cred.status = "revoked"
            cred.revoked_at = datetime.now(UTC)
            cred.access_token = None
            await self._repo.save_credential(cred)
            self._keys.delete(cred.private_key_storage_key)
            if cred.refresh_credential_storage_key:
                self._keys.delete(cred.refresh_credential_storage_key)

        if enrollment is not None:
            enrollment.enrollment_status = EnrollmentStatus.REVOKED.value
            enrollment.revoked_at = datetime.now(UTC)
            await self._repo.save_enrollment(enrollment)

        return {"status": "revoked", "syncEnabled": False}

    async def ensure_access_token(self) -> EndpointCredential:
        cred = await self._repo.get_credential()
        if cred is None or cred.status != "active":
            raise CopilotError("endpoint not enrolled", code="not_enrolled")
        now = datetime.now(UTC)
        expires = cred.access_token_expires_at
        if expires is not None and expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        if cred.access_token and expires and expires > now + __import__("datetime").timedelta(minutes=1):
            set_token = getattr(self._center, "set_access_token", None)
            if callable(set_token):
                set_token(cred.access_token)
            configure = getattr(self._center, "configure_device_auth", None)
            if callable(configure) and cred.private_key_storage_key:
                private_key = self._keys.load_private_key(cred.private_key_storage_key)
                if private_key:
                    configure(endpoint_id=cred.endpoint_id, private_key_b64=private_key)
            return cred

        if not cred.refresh_credential_storage_key:
            raise CopilotError("refresh credential missing", code="refresh_missing")
        refresh = self._keys.load_refresh_credential(cred.refresh_credential_storage_key)
        private_key = self._keys.load_private_key(cred.private_key_storage_key)
        if not refresh or not private_key:
            raise CopilotError("credential material missing", code="credential_missing")

        configure = getattr(self._center, "configure_device_auth", None)
        if callable(configure):
            configure(endpoint_id=cred.endpoint_id, private_key_b64=private_key)

        sig = sign_message(private_key, f"refresh:{cred.endpoint_id}".encode())
        refreshed = await self._center.token_refresh(
            endpoint_id=cred.endpoint_id,
            refresh_credential=refresh,
            device_signature=sig,
        )
        cred.access_token = refreshed.access_token
        cred.access_token_expires_at = _parse_expires(refreshed.access_token_expires_at)
        if refreshed.refresh_credential:
            self._keys.store_refresh_credential(cred.endpoint_id, refreshed.refresh_credential)
        set_token = getattr(self._center, "set_access_token", None)
        if callable(set_token):
            set_token(cred.access_token)
        await self._repo.save_credential(cred)
        return cred

    def is_sync_enabled(self, enrollment: EndpointEnrollment | None, cred: EndpointCredential | None) -> bool:
        return bool(
            enrollment
            and enrollment.enrollment_status == EnrollmentStatus.COMPLETED.value
            and cred
            and cred.status == "active"
        )
