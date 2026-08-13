from __future__ import annotations

import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta

from core.config import Settings, get_settings
from core.errors import ErrorCode, SaltControlError
from db.repositories.interfaces import BindingRecord, DesiredStateRecord, RepositoryBundle
from integrations.management_backend import ManagementBackend
from schemas.desired_state import (
    DesiredHermes,
    DesiredRollout,
    DesiredSecretRef,
    DesiredStateResponse,
    DesiredUser,
)

SYSTEM_ACCOUNTS = frozenset({"system", "nt authority\\system", "nt authority/system", "localsystem"})


class DesiredStateService:
    def __init__(
        self,
        repos: RepositoryBundle,
        backend: ManagementBackend,
        settings: Settings | None = None,
    ) -> None:
        self.repos = repos
        self.backend = backend
        self.settings = settings or get_settings()

    async def get(self, endpoint_id: str, known_revision: str | None = None) -> DesiredStateResponse:
        cached = await self.repos.desired_states.get_latest(endpoint_id)

        if not self.backend.available:
            return self._from_last_known_good(endpoint_id, cached, known_revision)

        try:
            binding = await self.backend.get_binding(endpoint_id)
            desired = await self.backend.get_desired_state(endpoint_id)
        except SaltControlError:
            raise
        except Exception as exc:
            if cached is not None:
                return self._from_last_known_good(endpoint_id, cached, known_revision)
            raise SaltControlError(
                ErrorCode.DESIRED_STATE_UNAVAILABLE,
                "desired state backend unavailable",
                status_code=503,
            ) from exc

        if binding is None:
            raise SaltControlError(ErrorCode.BINDING_MISSING, "endpoint user binding missing", status_code=404)
        self._assert_binding(
            endpoint_id=endpoint_id,
            binding_endpoint_id=binding.endpoint_id,
            user_id=binding.user_id,
            windows_account=binding.windows_account,
            windows_sid=binding.windows_sid,
            profile_dir=binding.profile_dir,
            revision=binding.revision,
        )
        if desired is None:
            if cached is not None:
                return self._from_last_known_good(endpoint_id, cached, known_revision)
            raise SaltControlError(
                ErrorCode.DESIRED_STATE_UNAVAILABLE,
                "desired state unavailable",
                status_code=503,
            )

        await self.repos.bindings.upsert(
            BindingRecord(
                endpoint_id=binding.endpoint_id,
                user_id=binding.user_id,
                windows_account=binding.windows_account,
                windows_sid=binding.windows_sid,
                profile_dir=binding.profile_dir,
                active=True,
                revision=binding.revision,
                bound_at=datetime.now(UTC),
            )
        )

        if known_revision and known_revision == desired.revision:
            return DesiredStateResponse(
                schema_="smc.desired-state.v2",
                endpoint_id=endpoint_id,
                revision=desired.revision,
                not_modified=True,
            )

        payload = {
            "userId": binding.user_id,
            "windowsAccount": binding.windows_account,
            "windowsSid": binding.windows_sid,
            "profileDir": binding.profile_dir,
            "hermes": {
                "home": desired.hermes_home,
                "version": desired.hermes_version,
                "artifactRef": desired.artifact_ref,
            },
            "profiles": desired.profiles,
            "mcp": desired.mcp,
            "rollout": {"ring": desired.ring, "desiredOwner": desired.desired_owner},
            "secrets": desired.secrets,
        }
        checksum = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        await self.repos.desired_states.put(
            DesiredStateRecord(
                id=f"ds_{secrets.token_urlsafe(8)}",
                endpoint_id=endpoint_id,
                user_id=binding.user_id,
                revision=desired.revision,
                payload_json=payload,
                checksum=checksum,
                created_at=datetime.now(UTC),
            )
        )

        return DesiredStateResponse(
            schema_="smc.desired-state.v2",
            endpoint_id=endpoint_id,
            revision=desired.revision,
            not_modified=False,
            user=DesiredUser(
                user_id=binding.user_id,
                windows_account=binding.windows_account,
                windows_sid=binding.windows_sid,
                profile_dir=binding.profile_dir,
            ),
            hermes=DesiredHermes(
                home=desired.hermes_home,
                version=desired.hermes_version,
                artifact_ref=desired.artifact_ref,
            ),
            profiles=list(desired.profiles),
            mcp=dict(desired.mcp),
            secrets=[DesiredSecretRef(name=s["name"], ref=s["ref"]) for s in desired.secrets],
            rollout=DesiredRollout(ring=desired.ring, desired_owner=desired.desired_owner),
        )

    def _from_last_known_good(
        self,
        endpoint_id: str,
        cached: DesiredStateRecord | None,
        known_revision: str | None,
    ) -> DesiredStateResponse:
        if cached is None:
            raise SaltControlError(
                ErrorCode.DESIRED_STATE_UNAVAILABLE,
                "desired state backend unavailable",
                status_code=503,
            )
        if cached.created_at is not None:
            age = datetime.now(UTC) - cached.created_at
            if age > timedelta(seconds=self.settings.desired_state_lkg_ttl_seconds):
                raise SaltControlError(
                    ErrorCode.DESIRED_STATE_UNAVAILABLE,
                    "last-known-good desired state expired",
                    status_code=503,
                )
        # Never generate empty pillar — only return persisted LKG.
        if known_revision and known_revision == cached.revision:
            return DesiredStateResponse(
                schema_="smc.desired-state.v2",
                endpoint_id=endpoint_id,
                revision=cached.revision,
                not_modified=True,
            )
        payload = cached.payload_json
        hermes = payload.get("hermes") or {}
        rollout = payload.get("rollout") or {}
        self._assert_binding(
            endpoint_id=endpoint_id,
            binding_endpoint_id=endpoint_id,
            user_id=str(payload.get("userId") or cached.user_id),
            windows_account=str(payload.get("windowsAccount") or ""),
            windows_sid=str(payload.get("windowsSid") or ""),
            profile_dir=str(payload.get("profileDir") or ""),
            revision=cached.revision,
        )
        return DesiredStateResponse(
            schema_="smc.desired-state.v2",
            endpoint_id=endpoint_id,
            revision=cached.revision,
            not_modified=False,
            user=DesiredUser(
                user_id=str(payload.get("userId") or cached.user_id),
                windows_account=str(payload.get("windowsAccount") or ""),
                windows_sid=str(payload.get("windowsSid") or ""),
                profile_dir=str(payload.get("profileDir") or ""),
            ),
            hermes=DesiredHermes(
                home=str(hermes.get("home") or ""),
                version=str(hermes.get("version") or ""),
                artifact_ref=str(hermes.get("artifactRef") or ""),
            ),
            profiles=list(payload.get("profiles") or []),
            mcp=dict(payload.get("mcp") or {}),
            secrets=[
                DesiredSecretRef(name=s["name"], ref=s["ref"])
                for s in (payload.get("secrets") or [])
                if isinstance(s, dict) and "name" in s and "ref" in s
            ],
            rollout=DesiredRollout(
                ring=str(rollout.get("ring") or ""),
                desired_owner=str(rollout.get("desiredOwner") or "salt"),
            ),
        )

    @staticmethod
    def _assert_binding(
        *,
        endpoint_id: str,
        binding_endpoint_id: str,
        user_id: str,
        windows_account: str,
        windows_sid: str,
        profile_dir: str,
        revision: str,
    ) -> None:
        if binding_endpoint_id != endpoint_id:
            raise SaltControlError(ErrorCode.VALIDATION_ERROR, "binding endpoint mismatch", status_code=400)
        fields = (user_id, windows_account, windows_sid, profile_dir, revision)
        if any(not str(item).strip() for item in fields):
            raise SaltControlError(ErrorCode.VALIDATION_ERROR, "binding fields incomplete", status_code=400)
        if windows_account.strip().lower() in SYSTEM_ACCOUNTS:
            raise SaltControlError(ErrorCode.VALIDATION_ERROR, "system binding forbidden", status_code=400)
