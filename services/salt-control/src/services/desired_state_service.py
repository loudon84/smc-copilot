from __future__ import annotations

import hashlib
import json
import secrets
from datetime import UTC, datetime

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


class DesiredStateService:
    def __init__(self, repos: RepositoryBundle, backend: ManagementBackend) -> None:
        self.repos = repos
        self.backend = backend

    async def get(self, endpoint_id: str, known_revision: str | None = None) -> DesiredStateResponse:
        if not self.backend.available:
            raise SaltControlError(
                ErrorCode.DESIRED_STATE_UNAVAILABLE,
                "desired state backend unavailable",
                status_code=503,
            )

        try:
            binding = await self.backend.get_binding(endpoint_id)
            desired = await self.backend.get_desired_state(endpoint_id)
        except Exception as exc:
            raise SaltControlError(
                ErrorCode.DESIRED_STATE_UNAVAILABLE,
                "desired state backend unavailable",
                status_code=503,
            ) from exc

        if binding is None:
            raise SaltControlError(ErrorCode.BINDING_MISSING, "endpoint user binding missing", status_code=404)
        if desired is None:
            raise SaltControlError(
                ErrorCode.DESIRED_STATE_UNAVAILABLE,
                "desired state unavailable",
                status_code=503,
            )

        # Persist binding locally (user from binding, never grain)
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
            "hermes": {
                "home": desired.hermes_home,
                "version": desired.hermes_version,
                "artifactRef": desired.artifact_ref,
            },
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
