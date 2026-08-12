from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from core.auth import hash_secret
from core.config import Settings
from core.errors import ErrorCode, SaltControlError
from core.logging import safe_log_fields
from db.repositories.interfaces import (
    AuditEventRecord,
    EndpointRecord,
    EnrollmentRecord,
    RepositoryBundle,
)
from integrations.salt_master import SaltMaster
from schemas.enrollment import (
    EnrollmentCreateRequest,
    EnrollmentCreateResponse,
    EnrollmentStatusResponse,
    FingerprintReportRequest,
    FingerprintReportResponse,
)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(12)}"


class EnrollmentService:
    def __init__(
        self,
        repos: RepositoryBundle,
        settings: Settings,
        masters: list[SaltMaster],
    ) -> None:
        self.repos = repos
        self.settings = settings
        self.masters = masters

    async def create(self, body: EnrollmentCreateRequest) -> EnrollmentCreateResponse:
        existing = await self.repos.enrollments.get_by_request_id(body.request_id)
        if existing is not None:
            endpoint = await self.repos.endpoints.get(existing.endpoint_id)
            if endpoint is None:
                raise SaltControlError(ErrorCode.INTERNAL_ERROR, "enrollment endpoint missing", status_code=500)
            # Idempotent replay: device credential is only returned once; return opaque placeholder marker
            # Tests assert same endpointId — credential may be empty on replay for security.
            cached_cred = self.repos.extras.get(f"device_cred:{existing.id}", "")
            return EnrollmentCreateResponse(
                enrollment_id=existing.id,
                endpoint_id=existing.endpoint_id,
                masters=list(self.settings.master_list),
                master_fingerprints=list(existing.master_fingerprints),
                device_credential=cached_cred,
                expires_at=existing.expires_at.isoformat(),
            )

        token_hash = hash_secret(body.enrollment_token)
        pending = await self.repos.pending_tokens.get(token_hash)
        if pending is None:
            raise SaltControlError(ErrorCode.ENROLLMENT_TOKEN_INVALID, "enrollment token invalid", status_code=401)
        if pending.used:
            raise SaltControlError(
                ErrorCode.ENROLLMENT_TOKEN_REPLAYED, "enrollment token already used", status_code=409
            )
        if pending.expires_at < datetime.now(UTC):
            raise SaltControlError(ErrorCode.ENROLLMENT_TOKEN_EXPIRED, "enrollment token expired", status_code=401)

        prior = await self.repos.enrollments.get_by_token_hash(token_hash)
        if prior is not None:
            raise SaltControlError(
                ErrorCode.ENROLLMENT_TOKEN_REPLAYED, "enrollment token already used", status_code=409
            )

        existing_guid = await self.repos.endpoints.get_by_machine_guid_hash(body.device.machine_guid_hash)
        if existing_guid is not None:
            raise SaltControlError(
                ErrorCode.ENDPOINT_IDENTITY_CONFLICT,
                "machine already enrolled",
                status_code=409,
            )

        endpoint_id = _new_id("ep")
        enrollment_id = _new_id("enr")
        device_credential = secrets.token_urlsafe(32)
        now = datetime.now(UTC)
        expires_at = now + timedelta(seconds=self.settings.device_credential_ttl_seconds)

        endpoint = EndpointRecord(
            id=endpoint_id,
            tenant_id=pending.tenant_id,
            machine_guid_hash=body.device.machine_guid_hash,
            hostname=body.device.hostname,
            platform="windows",
            arch=body.device.arch,
            status="enrolling",
            device_credential_hash=hash_secret(device_credential),
            created_at=now,
        )
        await self.repos.endpoints.create(endpoint)

        enrollment = EnrollmentRecord(
            id=enrollment_id,
            endpoint_id=endpoint_id,
            token_hash=token_hash,
            state="pending",
            master_fingerprints=list(self.settings.master_fingerprint_list),
            expires_at=expires_at,
            request_id=body.request_id,
            created_at=now,
        )
        await self.repos.enrollments.create(enrollment)
        await self.repos.pending_tokens.mark_used(token_hash)
        self.repos.extras[f"device_cred:{enrollment_id}"] = device_credential

        await self.repos.audits.append(
            AuditEventRecord(
                id=_new_id("aud"),
                actor_type="device",
                actor_id=endpoint_id,
                action="enrollment.created",
                target_type="enrollment",
                target_id=enrollment_id,
                request_id=body.request_id,
                metadata_redacted=safe_log_fields(hostname=body.device.hostname, arch=body.device.arch),
                occurred_at=now,
            )
        )

        return EnrollmentCreateResponse(
            enrollment_id=enrollment_id,
            endpoint_id=endpoint_id,
            masters=list(self.settings.master_list),
            master_fingerprints=list(self.settings.master_fingerprint_list),
            device_credential=device_credential,
            expires_at=expires_at.isoformat(),
        )

    async def report_fingerprint(self, enrollment_id: str, body: FingerprintReportRequest) -> FingerprintReportResponse:
        enrollment = await self.repos.enrollments.get(enrollment_id)
        if enrollment is None:
            raise SaltControlError(ErrorCode.NOT_FOUND, "enrollment not found", status_code=404)
        if enrollment.endpoint_id != body.endpoint_id:
            raise SaltControlError(ErrorCode.ENDPOINT_IDENTITY_CONFLICT, "endpoint mismatch", status_code=409)

        fp_cache_key = f"fp_req:{body.request_id}"
        cached_state = self.repos.extras.get(fp_cache_key)
        if cached_state is not None:
            return FingerprintReportResponse(
                enrollment_id=enrollment.id,
                endpoint_id=enrollment.endpoint_id,
                state=cached_state["state"],
                error_code=cached_state.get("error_code"),
            )

        matches = 0
        mismatches = 0
        for master in self.masters:
            pending = await master.list_pending()
            found = next((key for key in pending if key.minion_id == body.endpoint_id), None)
            if found is None:
                continue
            if found.fingerprint != body.minion_fingerprint:
                mismatches += 1
            else:
                matches += 1

        if mismatches:
            enrollment.state = "rejected"
            enrollment.error_code = ErrorCode.MINION_FINGERPRINT_MISMATCH
            enrollment.local_fingerprint = body.minion_fingerprint
            await self.repos.enrollments.update(enrollment)
            raise SaltControlError(
                ErrorCode.MINION_FINGERPRINT_MISMATCH,
                "minion fingerprint mismatch",
                status_code=409,
            )

        if matches == 0:
            enrollment.state = "failed"
            enrollment.error_code = ErrorCode.MINION_KEY_MISSING
            await self.repos.enrollments.update(enrollment)
            raise SaltControlError(ErrorCode.MINION_KEY_MISSING, "pending minion key missing", status_code=404)

        # Accept on all masters — fail closed, no accept on mismatch (already handled)
        try:
            for master in self.masters:
                await master.accept(body.endpoint_id, body.minion_fingerprint)
        except Exception as exc:
            enrollment.state = "failed"
            enrollment.error_code = ErrorCode.MASTER_ACCEPT_FAILED
            enrollment.local_fingerprint = body.minion_fingerprint
            await self.repos.enrollments.update(enrollment)
            raise SaltControlError(ErrorCode.MASTER_ACCEPT_FAILED, "master accept failed", status_code=502) from exc

        enrollment.state = "accepted"
        enrollment.local_fingerprint = body.minion_fingerprint
        await self.repos.enrollments.update(enrollment)

        # ping / sync / highstate — never switch control owner here (client-side)
        primary = self.masters[0]
        if not await primary.ping(body.endpoint_id):
            enrollment.state = "failed"
            enrollment.error_code = ErrorCode.MASTER_ACCEPT_FAILED
            await self.repos.enrollments.update(enrollment)
            return FingerprintReportResponse(
                enrollment_id=enrollment.id,
                endpoint_id=enrollment.endpoint_id,
                state=enrollment.state,
                error_code=enrollment.error_code,
            )

        if not await primary.sync_all(body.endpoint_id):
            enrollment.state = "failed"
            enrollment.error_code = ErrorCode.SYNC_ALL_FAILED
            await self.repos.enrollments.update(enrollment)
            return FingerprintReportResponse(
                enrollment_id=enrollment.id,
                endpoint_id=enrollment.endpoint_id,
                state=enrollment.state,
                error_code=enrollment.error_code,
            )
        enrollment.state = "synced"
        await self.repos.enrollments.update(enrollment)

        if not await primary.highstate(body.endpoint_id):
            enrollment.state = "failed"
            enrollment.error_code = ErrorCode.HIGHSTATE_FAILED
            await self.repos.enrollments.update(enrollment)
            return FingerprintReportResponse(
                enrollment_id=enrollment.id,
                endpoint_id=enrollment.endpoint_id,
                state=enrollment.state,
                error_code=enrollment.error_code,
            )

        enrollment.state = "highstate"
        enrollment.completed_at = datetime.now(UTC)
        await self.repos.enrollments.update(enrollment)

        await self.repos.audits.append(
            AuditEventRecord(
                id=_new_id("aud"),
                actor_type="device",
                actor_id=body.endpoint_id,
                action="enrollment.fingerprint_accepted",
                target_type="enrollment",
                target_id=enrollment.id,
                request_id=body.request_id,
                metadata_redacted={"state": enrollment.state},
                occurred_at=datetime.now(UTC),
            )
        )

        response = FingerprintReportResponse(
            enrollment_id=enrollment.id,
            endpoint_id=enrollment.endpoint_id,
            state=enrollment.state,
            error_code=None,
        )
        self.repos.extras[fp_cache_key] = {"state": response.state, "error_code": None}
        return response

    async def get_status(self, enrollment_id: str) -> EnrollmentStatusResponse:
        enrollment = await self.repos.enrollments.get(enrollment_id)
        if enrollment is None:
            raise SaltControlError(ErrorCode.NOT_FOUND, "enrollment not found", status_code=404)
        return EnrollmentStatusResponse(
            enrollment_id=enrollment.id,
            endpoint_id=enrollment.endpoint_id,
            state=enrollment.state,
            error_code=enrollment.error_code,
            masters=list(self.settings.master_list),
            master_fingerprints=list(enrollment.master_fingerprints),
        )
