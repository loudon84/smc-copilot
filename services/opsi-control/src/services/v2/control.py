from __future__ import annotations

import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta

from core.auth import digest_payload
from core.config import Settings
from core.errors import ErrorCode, OpsiControlError
from db.repositories.interfaces import ActionRecord, RepositoryBundle, TargetRecord
from db.repositories.v2_store import (
    ClientSnapshotRecord,
    ConfigArtifactRecord,
    HermesReleaseRecord,
    MemoryV2Store,
    SqlV2Store,
    V2ArtifactRecord,
    V2Store,
    snapshot_payload,
)
from integrations.opsi_jsonrpc import OpsiJsonRpc
from schemas.models import ActionStatus, ActionTargetView, ActionView, Operation
from schemas.v2.models import (
    V2ActionCreateRequest,
    V2ArtifactTokenRequest,
    V2ArtifactTokenView,
    V2ArtifactView,
    V2BatchActionView,
    V2BatchAggregateStatus,
    V2ClientStatusView,
    V2ConfigCreateRequest,
    V2ConfigView,
    V2Operation,
    V2ReleaseUpsertRequest,
    V2ReleaseView,
)
from services.v2.action_utils import is_v2_action, v2_operation
from services.v2.artifact_token import ArtifactTokenClaims, mint_artifact_token, token_expiry, verify_artifact_token
from workers.command_dispatcher import dispatch_v2_queued


def _new_artifact_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


class V2ActionService:
    def __init__(self, repos: RepositoryBundle, rpc: OpsiJsonRpc, settings: Settings) -> None:
        self.repos = repos
        self.rpc = rpc
        self.settings = settings

    async def resolve_group_targets(self, group_id: str) -> list[str]:
        members = await self.rpc.call("objectToGroup_getObjects", {"groupId": group_id}, [])
        client_ids = sorted({str(m["objectId"]) for m in members if m.get("objectId")})
        if not client_ids:
            raise OpsiControlError(ErrorCode.NOT_FOUND, "group empty or not found", status_code=404)
        return client_ids

    async def create(self, body: V2ActionCreateRequest, actor_id: str) -> ActionView:
        if body.group_id:
            resolved = await self.resolve_group_targets(body.group_id)
            from schemas.v2.models import V2TargetRef
            body.targets = [V2TargetRef(client_id=cid) for cid in resolved]
        digest = digest_payload(body.model_dump(by_alias=True, mode="json"))
        existing = await self.repos.actions.get(body.request_id)
        if existing is not None:
            if existing.payload_digest != digest:
                raise OpsiControlError(ErrorCode.CONFLICT, "requestId payload mismatch", status_code=409)
            return await self.get(body.request_id)
        now = datetime.now(UTC)
        action = ActionRecord(
            request_id=body.request_id,
            operation=Operation.V2_COMMAND,
            payload_digest=digest,
            status=ActionStatus.QUEUED,
            actor_id=actor_id,
            created_at=now,
            updated_at=now,
            deadline=now + timedelta(hours=body.deadline_hours),
            payload_json=body.model_dump_json(by_alias=True),
            hermes_version=body.release_version,
            config_revision=body.config_revision,
            auto_repair_level=body.repair_level,
        )
        await self.repos.actions.put(action)
        for target in body.targets:
            await self.repos.targets.put(
                TargetRecord(
                    request_id=body.request_id,
                    client_id=target.client_id,
                    status=ActionStatus.QUEUED,
                )
            )
        await self.repos.audit.add(
            body.request_id,
            actor_id,
            "v2.action.created",
            json.dumps({
                "operation": body.operation,
                "operator": body.operator,
                "reason": body.reason,
                "groupId": body.group_id,
                "targetCount": len(body.targets),
                "concurrency": body.concurrency,
            }),
        )
        return await self.get(body.request_id)

    async def get(self, request_id: str) -> ActionView:
        action = await self.repos.actions.get(request_id)
        if action is None or not is_v2_action(action):
            raise OpsiControlError(ErrorCode.NOT_FOUND, "v2 action not found", status_code=404)
        targets = await self.repos.targets.list_for_request(request_id)
        return ActionView(
            request_id=action.request_id,
            operation=action.operation,
            status=action.status,
            payload_digest=action.payload_digest,
            targets=[
                ActionTargetView(
                    client_id=item.client_id,
                    status=item.status,
                    error_code=item.error_code or None,
                    message=item.message or None,
                    attempt=item.attempt or None,
                )
                for item in targets
            ],
            created_at=action.created_at,
            updated_at=action.updated_at,
        )

    async def results(self, request_id: str) -> list[dict]:
        action = await self.repos.actions.get(request_id)
        if action is None or not is_v2_action(action):
            raise OpsiControlError(ErrorCode.NOT_FOUND, "v2 action not found", status_code=404)
        items = await self.repos.results.list_for_request(request_id)
        return [
            {
                "requestId": item.request_id,
                "clientId": item.client_id,
                "status": item.status,
                "sha256": item.sha256 or None,
                "bytes": item.bytes or None,
                "redacted": item.redacted,
                "errorCode": item.error_code or None,
                "message": item.body[:512] if item.body else None,
            }
            for item in items
        ]

    async def cancel(self, request_id: str, actor_id: str, reason: str) -> ActionView:
        action = await self.repos.actions.get(request_id)
        if action is None or not is_v2_action(action):
            raise OpsiControlError(ErrorCode.NOT_FOUND, "v2 action not found", status_code=404)
        terminal = {ActionStatus.SUCCEEDED, ActionStatus.FAILED, ActionStatus.CANCELLED}
        if action.status in terminal:
            return await self.get(request_id)
        targets = await self.repos.targets.list_for_request(request_id)
        for target in targets:
            if target.status not in terminal:
                target.status = ActionStatus.CANCELLED
                target.message = f"cancelled: {reason}"
                await self.repos.targets.put(target)
        action.status = ActionStatus.CANCELLED
        action.updated_at = datetime.now(UTC)
        await self.repos.actions.put(action)
        await self.repos.audit.add(request_id, actor_id, "v2.action.cancelled", reason)
        return await self.get(request_id)

    async def batch_status(self, request_id: str) -> V2BatchActionView:
        action = await self.repos.actions.get(request_id)
        if action is None or not is_v2_action(action):
            raise OpsiControlError(ErrorCode.NOT_FOUND, "v2 action not found", status_code=404)
        targets = await self.repos.targets.list_for_request(request_id)
        succeeded = sum(1 for t in targets if t.status == ActionStatus.SUCCEEDED)
        failed = sum(1 for t in targets if t.status == ActionStatus.FAILED)
        cancelled = sum(1 for t in targets if t.status == ActionStatus.CANCELLED)
        pending = len(targets) - succeeded - failed - cancelled
        if action.status == ActionStatus.CANCELLED:
            agg = V2BatchAggregateStatus.CANCELLED
        elif failed > 0 and succeeded > 0:
            agg = V2BatchAggregateStatus.PARTIAL_FAILURE
        elif failed > 0 and pending == 0:
            agg = V2BatchAggregateStatus.FAILED
        elif succeeded == len(targets):
            agg = V2BatchAggregateStatus.SUCCEEDED
        elif pending == len(targets):
            agg = V2BatchAggregateStatus.QUEUED
        else:
            agg = V2BatchAggregateStatus.RUNNING
        payload = json.loads(action.payload_json or "{}")
        return V2BatchActionView(
            request_id=action.request_id,
            operation=V2Operation(payload.get("operation", "status")),
            status=agg,
            group_id=payload.get("groupId"),
            targets_digest=action.payload_digest,
            concurrency=int(payload.get("concurrency", 1)),
            total=len(targets),
            succeeded=succeeded,
            failed=failed,
            pending=pending,
            cancelled=cancelled,
        )

    async def dispatch_once(self) -> int:
        return await dispatch_v2_queued(self.repos, self.rpc, self.settings, "v2-dispatcher")


class V2ConfigService:
    def __init__(self, store: V2Store, repos: RepositoryBundle) -> None:
        self.store = store
        self.repos = repos

    async def create(self, body: V2ConfigCreateRequest, actor_id: str) -> V2ConfigView:
        if await self.store.get_config(body.revision) is not None:
            raise OpsiControlError(ErrorCode.CONFLICT, "config revision exists", status_code=409)
        digest = hashlib.sha256(body.content_yaml.encode("utf-8")).hexdigest()
        artifact_id = _new_artifact_id("cfg")
        record = ConfigArtifactRecord(
            revision=body.revision,
            sha256=digest,
            artifact_id=artifact_id,
            payload_json=json.dumps({"contentYaml": body.content_yaml}),
            created_by=actor_id,
        )
        await self.store.put_config(record)
        await self.store.put_artifact(
            V2ArtifactRecord(
                artifact_id=artifact_id,
                artifact_type="config",
                sha256=digest,
                size_bytes=len(body.content_yaml.encode("utf-8")),
                status="ready",
                payload_json=json.dumps({"revision": body.revision}),
            )
        )
        await self.repos.audit.add(
            f"cfg_{body.revision}",
            actor_id,
            "v2.config.created",
            json.dumps({"revision": body.revision, "operator": body.operator, "reason": body.reason}),
        )
        return V2ConfigView(
            revision=record.revision,
            sha256=record.sha256,
            artifact_id=record.artifact_id,
            created_at=record.created_at.isoformat(),
            created_by=record.created_by,
        )

    async def get(self, revision: int) -> V2ConfigView:
        record = await self.store.get_config(revision)
        if record is None:
            raise OpsiControlError(ErrorCode.NOT_FOUND, "config revision not found", status_code=404)
        return V2ConfigView(
            revision=record.revision,
            sha256=record.sha256,
            artifact_id=record.artifact_id,
            created_at=record.created_at.isoformat(),
            created_by=record.created_by,
        )


class V2ReleaseService:
    def __init__(self, store: V2Store, repos: RepositoryBundle, settings: Settings) -> None:
        self.store = store
        self.repos = repos
        self.settings = settings

    async def upsert(self, body: V2ReleaseUpsertRequest, actor_id: str) -> V2ReleaseView:
        if body.live_eligible and not self.settings.installer_manual_gate_signed:
            raise OpsiControlError(ErrorCode.PRECONDITION_FAILED, "installer manual gate unsigned", status_code=412)
        artifact_id = _new_artifact_id("rel")
        record = HermesReleaseRecord(
            release_version=body.release_version,
            hermes_version=body.hermes_version,
            smc_revision=body.smc_revision,
            sha256=body.sha256,
            manifest_sha256=body.manifest_sha256,
            signer_key_id=body.signer_key_id,
            artifact_id=artifact_id,
            live_eligible=body.live_eligible,
            payload_json=body.model_dump_json(by_alias=True),
        )
        await self.store.put_release(record)
        await self.store.put_artifact(
            V2ArtifactRecord(
                artifact_id=artifact_id,
                artifact_type="release",
                sha256=body.sha256,
                status="ready",
                payload_json=json.dumps({"releaseVersion": body.release_version}),
            )
        )
        await self.repos.audit.add(
            f"rel_{body.release_version}",
            actor_id,
            "v2.release.upserted",
            json.dumps({"releaseVersion": body.release_version, "operator": body.operator, "reason": body.reason}),
        )
        return V2ReleaseView(
            release_version=record.release_version,
            hermes_version=record.hermes_version,
            smc_revision=record.smc_revision,
            sha256=record.sha256,
            manifest_sha256=record.manifest_sha256,
            signer_key_id=record.signer_key_id,
            artifact_id=record.artifact_id,
            live_eligible=record.live_eligible,
        )

    async def get(self, release_version: str) -> V2ReleaseView:
        record = await self.store.get_release(release_version)
        if record is None:
            raise OpsiControlError(ErrorCode.NOT_FOUND, "release not found", status_code=404)
        return V2ReleaseView(
            release_version=record.release_version,
            hermes_version=record.hermes_version,
            smc_revision=record.smc_revision,
            sha256=record.sha256,
            manifest_sha256=record.manifest_sha256,
            signer_key_id=record.signer_key_id,
            artifact_id=record.artifact_id,
            live_eligible=record.live_eligible,
        )


class V2ArtifactService:
    def __init__(self, store: V2Store, repos: RepositoryBundle, settings: Settings) -> None:
        self.store = store
        self.repos = repos
        self.settings = settings

    async def get(self, artifact_id: str) -> V2ArtifactView:
        record = await self.store.get_artifact(artifact_id)
        if record is None:
            raise OpsiControlError(ErrorCode.NOT_FOUND, "artifact not found", status_code=404)
        return V2ArtifactView(
            artifact_id=record.artifact_id,
            artifact_type=record.artifact_type,
            request_id=record.request_id,
            client_id=record.client_id,
            sha256=record.sha256,
            size_bytes=record.size_bytes,
            status=record.status,
        )

    async def mint_token(self, body: V2ArtifactTokenRequest, actor_id: str) -> V2ArtifactTokenView:
        record = await self.store.get_artifact(body.artifact_id)
        if record is None:
            raise OpsiControlError(ErrorCode.NOT_FOUND, "artifact not found", status_code=404)
        if record.client_id and record.client_id != body.client_id:
            raise OpsiControlError(ErrorCode.FORBIDDEN, "artifact client binding mismatch", status_code=403)
        if record.request_id and record.request_id != body.request_id:
            raise OpsiControlError(ErrorCode.FORBIDDEN, "artifact request binding mismatch", status_code=403)
        expires = token_expiry(self.settings)
        claims = ArtifactTokenClaims(
            artifact_id=body.artifact_id,
            artifact_type=record.artifact_type,
            client_id=body.client_id,
            request_id=body.request_id,
            direction=body.direction,
            expires_at=int(expires.timestamp()),
            max_bytes=self.settings.artifact_max_bytes,
        )
        token = mint_artifact_token(claims, settings=self.settings)
        verify_artifact_token(
            token,
            settings=self.settings,
            artifact_id=body.artifact_id,
            client_id=body.client_id,
            request_id=body.request_id,
            direction=body.direction,
        )
        await self.repos.audit.add(body.request_id, actor_id, "v2.artifact.token", body.artifact_id)
        base = self.settings.artifact_base_url.rstrip("/")
        upload_url = f"{base}/artifacts/{body.artifact_id}/upload" if body.direction == "upload" else None
        download_url = f"{base}/artifacts/{body.artifact_id}/download" if body.direction == "download" else None
        return V2ArtifactTokenView(
            artifact_id=body.artifact_id,
            token=token,
            expires_at=expires.isoformat(),
            upload_url=upload_url,
            download_url=download_url,
        )

    async def register_upload(
        self,
        *,
        artifact_id: str,
        client_id: str,
        request_id: str,
        token: str,
        sha256: str,
        size_bytes: int,
    ) -> V2ArtifactView:
        verify_artifact_token(
            token,
            settings=self.settings,
            artifact_id=artifact_id,
            client_id=client_id,
            request_id=request_id,
            direction="upload",
            size_bytes=size_bytes,
        )
        record = await self.store.get_artifact(artifact_id)
        if record is None:
            record = V2ArtifactRecord(artifact_id=artifact_id, artifact_type="logs")
        record.client_id = client_id
        record.request_id = request_id
        record.sha256 = sha256
        record.size_bytes = size_bytes
        record.status = "uploaded"
        await self.store.put_artifact(record)
        return await self.get(artifact_id)


class V2ClientService:
    def __init__(self, store: V2Store, rpc: OpsiJsonRpc) -> None:
        self.store = store
        self.rpc = rpc

    async def status(self, client_id: str) -> V2ClientStatusView:
        hosts = await self.rpc.call("host_getObjects", {"id": client_id}, [])
        if not hosts:
            raise OpsiControlError(ErrorCode.NOT_FOUND, "client not found", status_code=404)
        snapshot = await self.store.get_snapshot(client_id)
        if snapshot is None:
            return V2ClientStatusView(
                client_id=client_id,
                reachable=False,
                hermes={"installed": False},
                gateway={"state": "unknown"},
                config={"revision": 0, "valid": False},
                updated_at=datetime.now(UTC).isoformat(),
            )
        payload = snapshot_payload(snapshot)
        return V2ClientStatusView(
            client_id=client_id,
            reachable=snapshot.reachable,
            hermes=payload.get("hermes") or {},
            gateway=payload.get("gateway") or {},
            config=payload.get("config") or {},
            updated_at=snapshot.updated_at.isoformat(),
        )

    async def put_snapshot(self, record: ClientSnapshotRecord) -> None:
        await self.store.put_snapshot(record)


def build_v2_store(settings: Settings, session_factory=None) -> V2Store:
    if settings.opsi_env == "test" or session_factory is None:
        return MemoryV2Store()
    return SqlV2Store(session_factory)
