from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from core.auth import AuthPrincipal, digest_payload
from core.config import Settings
from core.errors import ErrorCode, OpsiControlError
from db.repositories.rollout_memory import MemoryRolloutStore
from db.repositories.rollout_records import (
    ApprovalRecord,
    BatchRecord,
    CampaignRecord,
    EventRecord,
    GateRecord,
    IdempotencyRecord,
    LiveGateRecord,
    PromotionRecord,
    RolloutTargetRecord,
)
from domain.gates import GATE_POLICY_VERSION, evaluate_campaign_gates, gate_input_digest
from domain.preflight import evaluate_target, preflight_expired
from domain.snapshot import MAX_DISPATCH_PER_TICK, PILOT_MIN, canonicalize_client_ids, snapshot_digest, split_batches
from integrations.opsi_jsonrpc import OpsiJsonRpc
from schemas.models import ActionCreateRequest, ActionStatus, Operation, TargetRef, UserBinding
from schemas.rollout import (
    ACTIVE_CAMPAIGN,
    TERMINAL_CAMPAIGN,
    AbortRequest,
    ApprovalKind,
    ApproveRequest,
    ArtifactChannel,
    ArtifactPromoteRequest,
    BatchStatus,
    CampaignStatus,
    EvidenceManifestView,
    MetricsView,
    PauseRequest,
    PreflightCheckView,
    ResumeRequest,
    RollbackRequest,
    RollbackScope,
    RolloutBatchView,
    RolloutCampaignView,
    RolloutCreateRequest,
    RolloutRole,
    RolloutTargetView,
    StartRequest,
    TargetStatus,
)
from services.control import ActionService


class RolloutService:
    def __init__(
        self,
        store: MemoryRolloutStore,
        rpc: OpsiJsonRpc,
        settings: Settings,
        actions: ActionService,
        facts: dict[str, dict[str, Any]] | None = None,
    ) -> None:
        self.store = store
        self.rpc = rpc
        self.settings = settings
        self.actions = actions
        self.facts = facts if facts is not None else {}
        self.metric_counts = {
            "dispatch_success": 0,
            "dispatch_failure": 0,
            "rollback_success": 0,
            "rollback_failure": 0,
            "pause_causes": {},
        }

    async def create(
        self, body: RolloutCreateRequest, principal: AuthPrincipal, idempotency_key: str
    ) -> RolloutCampaignView:
        self._require_role(principal, RolloutRole.RELEASE_OWNER)
        replay = await self._idempotent(
            principal.subject, idempotency_key, "create", body.campaign_id, body.model_dump(by_alias=True, mode="json")
        )
        if replay:
            return replay
        if await self.store.get_campaign(body.campaign_id):
            raise OpsiControlError(ErrorCode.CONFLICT, "campaign exists", status_code=409)
        client_ids = canonicalize_client_ids(body.client_ids)
        active = await self.store.active_client_ids()
        overlap = [item for item in client_ids if item in active]
        if overlap:
            raise OpsiControlError(ErrorCode.CONFLICT, "client already in active campaign", status_code=409)
        digest = snapshot_digest(client_ids)
        now = datetime.now(UTC)
        record = CampaignRecord(
            campaign_id=body.campaign_id,
            name=body.name,
            status=CampaignStatus.DRAFT.value,
            revision=1,
            snapshot_digest=digest,
            client_ids=client_ids,
            product_id=body.product_id,
            product_version=body.product_version,
            package_version=body.package_version,
            artifact_digest=body.artifact_digest,
            signer_key_id=body.signer_key_id,
            config_revision=body.config_revision,
            gate_policy_revision=body.gate_policy_revision,
            evidence_policy_revision=body.evidence_policy_revision,
            creator_id=principal.subject,
            change_ticket=body.change_ticket,
            reason=body.reason,
            window_start=body.window_start,
            window_end=body.window_end,
            created_at=now,
            updated_at=now,
        )
        await self.store.put_campaign(record)
        batches = []
        targets = []
        for index, ids, hours in split_batches(client_ids):
            batches.append(
                BatchRecord(
                    campaign_id=body.campaign_id,
                    batch_index=index,
                    status=BatchStatus.PENDING.value,
                    client_ids=ids,
                    observe_hours=hours,
                )
            )
            for client_id in ids:
                targets.append(
                    RolloutTargetRecord(
                        campaign_id=body.campaign_id,
                        client_id=client_id,
                        batch_index=index,
                        status=TargetStatus.PENDING.value,
                    )
                )
        await self.store.replace_batches(body.campaign_id, batches)
        await self.store.replace_targets(body.campaign_id, targets)
        await self._event(body.campaign_id, principal.subject, "campaign.created", digest)
        view = await self.get(body.campaign_id)
        await self._save_idempotent(principal.subject, idempotency_key, "create", body.campaign_id, body, view)
        return view

    async def preflight(
        self, campaign_id: str, principal: AuthPrincipal, expected_revision: int
    ) -> RolloutCampaignView:
        campaign = await self._get(campaign_id)
        self._match(campaign, expected_revision)
        campaign.status = CampaignStatus.PREFLIGHTING.value
        promotion = await self.store.get_promotion(campaign.artifact_digest)
        channel = promotion.channel if promotion else ""
        promo_ok = bool(promotion) and promotion.digest == campaign.artifact_digest
        active = await self.store.active_client_ids(exclude_campaign=campaign_id)
        ineligible = False
        for target in await self.store.list_targets(campaign_id):
            checks, baseline_version, baseline_digest, reason = await evaluate_target(
                rpc=self.rpc,
                client_id=target.client_id,
                campaign_id=campaign_id,
                product_id=campaign.product_id,
                product_version=campaign.product_version,
                artifact_digest=campaign.artifact_digest,
                facts=self.facts,
                active_clients=active,
                promotion_ok=promo_ok,
                promotion_channel=channel or "missing",
            )
            target.preflight_json = json.dumps(checks)
            target.preflight_at = datetime.now(UTC)
            target.baseline_version = baseline_version
            target.baseline_digest = baseline_digest
            target.baseline_owner = str(self.facts.get(target.client_id, {}).get("owner") or "opsi")
            if reason or target.baseline_owner != "opsi":
                target.status = TargetStatus.INELIGIBLE.value
                target.ineligible_reason = reason or "owner_conflict"
                ineligible = True
            else:
                target.status = TargetStatus.PREFLIGHT_READY.value
                target.ineligible_reason = ""
            await self.store.put_target(target)
        campaign.status = CampaignStatus.DRAFT.value if ineligible else CampaignStatus.AWAITING_APPROVAL.value
        await self.store.cas_campaign(campaign, expected_revision)
        await self._event(campaign_id, principal.subject, "campaign.preflight", campaign.status)
        return await self.get(campaign_id)

    async def approve(
        self, campaign_id: str, body: ApproveRequest, principal: AuthPrincipal, expected_revision: int
    ) -> RolloutCampaignView:
        campaign = await self._get(campaign_id)
        self._match(campaign, expected_revision)
        role = self._primary_role(principal)
        if principal.subject == campaign.creator_id and role == RolloutRole.ENDPOINT_OPS:
            others = await self.store.list_approvals(campaign_id, body.kind.value)
            if any(item.actor_id == principal.subject for item in others):
                raise OpsiControlError(
                    ErrorCode.FORBIDDEN, "creator cannot satisfy both approval roles", status_code=403
                )
        if body.kind == ApprovalKind.START and campaign.status != CampaignStatus.AWAITING_APPROVAL.value:
            raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "campaign not awaiting approval", status_code=400)
        await self.store.add_approval(
            ApprovalRecord(
                id=0,
                campaign_id=campaign_id,
                kind=body.kind.value,
                actor_id=principal.subject,
                role=role.value,
                campaign_revision=campaign.revision,
                reason=body.reason,
            )
        )
        if body.kind == ApprovalKind.NEXT_BATCH:
            batches = await self.store.list_batches(campaign_id)
            pending = next((item for item in batches if not item.approved and item.batch_index > 0), None)
            if pending:
                pending.approved = True
                pending.status = BatchStatus.READY.value
                await self.store.put_batch(pending)
        await self._event(campaign_id, principal.subject, "campaign.approved", f"{body.kind.value}:{role.value}")
        return await self.get(campaign_id)

    async def start(
        self, campaign_id: str, body: StartRequest, principal: AuthPrincipal, expected_revision: int
    ) -> RolloutCampaignView:
        campaign = await self._get(campaign_id)
        self._match(campaign, expected_revision)
        self._require_role(principal, RolloutRole.RELEASE_OWNER)
        await self._assert_live_gate()
        if not self.settings.pilot_start_enabled:
            raise OpsiControlError(ErrorCode.PRECONDITION_FAILED, "pilot start feature flag disabled", status_code=412)
        if self.settings.opsi_env == "production" and len(campaign.client_ids) < PILOT_MIN:
            raise OpsiControlError(
                ErrorCode.VALIDATION_ERROR, "production pilot requires 10-20 endpoints", status_code=400
            )
        if campaign.status != CampaignStatus.AWAITING_APPROVAL.value:
            raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "campaign cannot start", status_code=400)
        if any(item.status == TargetStatus.INELIGIBLE.value for item in await self.store.list_targets(campaign_id)):
            raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "ineligible targets block start", status_code=400)
        if any(preflight_expired(item.preflight_at) for item in await self.store.list_targets(campaign_id)):
            raise OpsiControlError(ErrorCode.PRECONDITION_FAILED, "preflight expired", status_code=412)
        await self._require_dual_approval(campaign_id, ApprovalKind.START, campaign.revision, campaign.creator_id)
        promotion = await self.store.get_promotion(campaign.artifact_digest)
        if promotion is not None and promotion.signer_key_id != campaign.signer_key_id:
            security = [
                item
                for item in await self.store.list_approvals(campaign_id, ApprovalKind.START.value)
                if item.role == RolloutRole.SECURITY_OWNER.value and item.campaign_revision == campaign.revision
            ]
            if not security:
                raise OpsiControlError(ErrorCode.FORBIDDEN, "security owner approval required", status_code=403)
        if promotion is None or promotion.channel != ArtifactChannel.PILOT.value:
            raise OpsiControlError(ErrorCode.PRECONDITION_FAILED, "start requires pilot artifact", status_code=412)
        batches = await self.store.list_batches(campaign_id)
        if batches:
            batches[0].status = BatchStatus.READY.value
            batches[0].approved = True
            await self.store.put_batch(batches[0])
        campaign.status = CampaignStatus.RUNNING.value
        await self.store.cas_campaign(campaign, expected_revision)
        await self._event(campaign_id, principal.subject, "campaign.started", campaign.snapshot_digest)
        return await self.get(campaign_id)

    async def pause(
        self, campaign_id: str, body: PauseRequest, principal: AuthPrincipal, expected_revision: int
    ) -> RolloutCampaignView:
        campaign = await self._get(campaign_id)
        self._match(campaign, expected_revision)
        if campaign.status in {s.value for s in TERMINAL_CAMPAIGN}:
            raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "terminal campaign", status_code=400)
        campaign.status = CampaignStatus.PAUSED.value
        campaign.pause_cause = body.cause
        campaign.fencing_token += 1
        await self.store.cas_campaign(campaign, expected_revision)
        self.metric_counts["pause_causes"][body.cause] = self.metric_counts["pause_causes"].get(body.cause, 0) + 1
        await self._event(campaign_id, principal.subject, "campaign.paused", body.cause)
        return await self.get(campaign_id)

    async def resume(
        self, campaign_id: str, body: ResumeRequest, principal: AuthPrincipal, expected_revision: int
    ) -> RolloutCampaignView:
        campaign = await self._get(campaign_id)
        self._match(campaign, expected_revision)
        if campaign.status != CampaignStatus.PAUSED.value:
            raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "campaign not paused", status_code=400)
        await self._require_dual_approval(campaign_id, ApprovalKind.RESUME, campaign.revision, campaign.creator_id)
        await self.preflight(campaign_id, principal, campaign.revision)
        campaign = await self._get(campaign_id)
        if any(item.status == TargetStatus.INELIGIBLE.value for item in await self.store.list_targets(campaign_id)):
            raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "resume blocked by ineligible targets", status_code=400)
        campaign.pause_cause = ""
        campaign.status = CampaignStatus.RUNNING.value
        await self.store.cas_campaign(campaign, campaign.revision)
        await self._event(campaign_id, principal.subject, "campaign.resumed", body.reason)
        return await self.get(campaign_id)

    async def abort(
        self, campaign_id: str, body: AbortRequest, principal: AuthPrincipal, expected_revision: int
    ) -> RolloutCampaignView:
        campaign = await self._get(campaign_id)
        self._match(campaign, expected_revision)
        campaign.status = CampaignStatus.ABORTED.value
        campaign.fencing_token += 1
        await self.store.cas_campaign(campaign, expected_revision)
        await self._event(campaign_id, principal.subject, "campaign.aborted", str(body.rollback_mutated))
        if body.rollback_mutated:
            await self.rollback(
                campaign_id,
                RollbackRequest(scope=RollbackScope.CAMPAIGN, reason=body.reason, change_ticket=body.change_ticket),
                principal,
                campaign.revision,
            )
        return await self.get(campaign_id)

    async def rollback(
        self, campaign_id: str, body: RollbackRequest, principal: AuthPrincipal, expected_revision: int
    ) -> RolloutCampaignView:
        campaign = await self._get(campaign_id)
        self._match(campaign, expected_revision)
        targets = await self.store.list_targets(campaign_id)
        selected: list[RolloutTargetRecord]
        if body.scope == RollbackScope.TARGET:
            selected = [item for item in targets if item.client_id == body.client_id and item.mutated]
        elif body.scope == RollbackScope.BATCH:
            idx = body.batch_index if body.batch_index is not None else 0
            selected = [item for item in targets if item.batch_index == idx and item.mutated]
        else:
            selected = sorted(
                [item for item in targets if item.mutated], key=lambda item: item.batch_index, reverse=True
            )
        campaign.status = CampaignStatus.ROLLING_BACK.value
        await self.store.cas_campaign(campaign, expected_revision)
        for target in selected:
            try:
                request_id = f"req_rb_{campaign_id[-8:]}_{target.client_id[:8]}".replace(".", "")
                fact = self.facts.get(target.client_id, {})
                binding = UserBinding(
                    sid=str(fact.get("userSid") or "S-1-5-21-1-2-3-1001"),
                    account=str(fact.get("userAccount") or "lab\\user"),
                )
                await self.actions.create(
                    ActionCreateRequest(
                        request_id=request_id[:80],
                        operation=Operation.UPDATE,
                        targets=[TargetRef(client_id=target.client_id, user_binding=binding)],
                        hermes_version=target.baseline_version or "0.21.0",
                    ),
                    principal.subject,
                )
                target.status = TargetStatus.ROLLED_BACK.value
                self.metric_counts["rollback_success"] += 1
            except Exception:
                target.status = TargetStatus.ROLLBACK_FAILED.value
                self.metric_counts["rollback_failure"] += 1
                campaign = await self._get(campaign_id)
                campaign.status = CampaignStatus.FAILED.value
                campaign.pause_cause = "rollback_failure"
                await self.store.put_target(target)
                await self.store.cas_campaign(campaign, campaign.revision)
                await self._event(campaign_id, principal.subject, "rollback.failed", target.client_id)
                return await self.get(campaign_id)
            await self.store.put_target(target)
        campaign = await self._get(campaign_id)
        if campaign.status != CampaignStatus.FAILED.value:
            campaign.status = CampaignStatus.PAUSED.value
            campaign.pause_cause = "rollback_complete"
            await self.store.cas_campaign(campaign, campaign.revision)
        await self._event(campaign_id, principal.subject, "campaign.rolled_back", body.scope.value)
        return await self.get(campaign_id)

    async def dispatch_once(self, worker_id: str = "rollout-worker") -> int:
        handled = 0
        for campaign in await self.store.list_campaigns():
            if campaign.status != CampaignStatus.RUNNING.value:
                continue
            if not await self.store.claim_orchestrator(worker_id, campaign.fencing_token):
                continue
            token = campaign.fencing_token
            if not self._in_window(campaign):
                continue
            batches = await self.store.list_batches(campaign.campaign_id)
            ready = next(
                (item for item in batches if item.status == BatchStatus.READY.value and not item.dispatched), None
            )
            if ready is None:
                continue
            latest = await self._get(campaign.campaign_id)
            if latest.fencing_token != token or latest.status != CampaignStatus.RUNNING.value:
                continue
            targets = [
                item
                for item in await self.store.list_targets(campaign.campaign_id)
                if item.batch_index == ready.batch_index
            ]
            ready.status = BatchStatus.DISPATCHING.value
            await self.store.put_batch(ready)
            for target in targets:
                if handled >= MAX_DISPATCH_PER_TICK:
                    break
                if target.status in {
                    TargetStatus.INELIGIBLE.value,
                    TargetStatus.SKIPPED.value,
                    TargetStatus.DISPATCHED.value,
                    TargetStatus.APPLYING.value,
                    TargetStatus.VERIFYING.value,
                    TargetStatus.HEALTHY.value,
                    TargetStatus.ROLLED_BACK.value,
                }:
                    continue
                if target.mutated or target.action_id:
                    continue
                if await self._client_has_open_mutation(target.client_id):
                    continue
                fact = self.facts.get(target.client_id, {})
                if fact.get("secretCanary"):
                    target.status = TargetStatus.FAILED.value
                    target.ineligible_reason = "secret_canary"
                    await self.store.put_target(target)
                    self.metric_counts["dispatch_failure"] += 1
                    await self._auto_pause(campaign.campaign_id, "secret_canary")
                    return handled + 1
                if fact.get("injectFailure"):
                    target.status = TargetStatus.FAILED.value
                    await self.store.put_target(target)
                    self.metric_counts["dispatch_failure"] += 1
                    await self._auto_pause(
                        campaign.campaign_id, "canary_failure" if ready.batch_index == 0 else "injected_failure"
                    )
                    return handled + 1
                request_id = f"req_ro_{campaign.campaign_id[4:12]}_{target.client_id.split('.')[0]}"[:80]
                binding = UserBinding(
                    sid=str(fact.get("userSid") or "S-1-5-21-1-2-3-1001"),
                    account=str(fact.get("userAccount") or "lab\\user"),
                )
                await self.actions.create(
                    ActionCreateRequest(
                        request_id=request_id,
                        operation=Operation.UPDATE,
                        targets=[TargetRef(client_id=target.client_id, user_binding=binding)],
                        hermes_version=campaign.product_version,
                    ),
                    "rollout-worker",
                )
                await self.actions.dispatch_once()
                target.status = TargetStatus.DISPATCHED.value
                target.action_id = request_id
                target.mutated = True
                await self.store.put_target(target)
                self.metric_counts["dispatch_success"] += 1
                handled += 1
            ready.dispatched = True
            ready.status = BatchStatus.VERIFYING.value
            await self.store.put_batch(ready)
            decision, cause, reason = evaluate_campaign_gates(
                targets=await self.store.list_targets(campaign.campaign_id), batch_index=ready.batch_index
            )
            await self.store.add_gate(
                GateRecord(
                    id=0,
                    campaign_id=campaign.campaign_id,
                    gate_type="batch",
                    decision=decision,
                    reason=reason,
                    input_digest=gate_input_digest({"batch": ready.batch_index, "cause": cause}),
                    evaluator=GATE_POLICY_VERSION,
                )
            )
            if decision == "PAUSE":
                await self._auto_pause(campaign.campaign_id, cause)
            else:
                ready.status = BatchStatus.OBSERVING.value
                await self.store.put_batch(ready)
        return handled

    async def promote(self, body: ArtifactPromoteRequest, principal: AuthPrincipal) -> dict[str, str]:
        self._require_role(principal, RolloutRole.RELEASE_OWNER)
        if body.to_channel == ArtifactChannel.STABLE:
            raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "v1.2 does not auto-promote to stable", status_code=400)
        if body.to_channel == ArtifactChannel.PILOT:
            gate = await self.store.get_live_gate()
            if gate is None or gate.decision != "GO":
                if self.settings.opsi_env == "production":
                    raise OpsiControlError(
                        ErrorCode.PRECONDITION_FAILED, "pilot promotion requires v1.1 GO evidence", status_code=412
                    )
                if not self.settings.pilot_start_enabled:
                    raise OpsiControlError(
                        ErrorCode.PRECONDITION_FAILED,
                        "pilot promotion requires live gate or test fixture",
                        status_code=412,
                    )
        record = PromotionRecord(
            digest=body.digest,
            product_version=body.product_version,
            signer_key_id=body.signer_key_id,
            channel=body.to_channel.value,
            evidence_ref=body.evidence_ref,
            actor_id=principal.subject,
        )
        await self.store.put_promotion(record)
        if body.to_channel == ArtifactChannel.QUARANTINED:
            for campaign in await self.store.list_campaigns():
                if campaign.artifact_digest == body.digest and campaign.status in {s.value for s in ACTIVE_CAMPAIGN}:
                    await self._auto_pause(campaign.campaign_id, "artifact_conflict")
        return {"digest": body.digest, "channel": body.to_channel.value}

    async def seed_live_gate_for_test(self, signed_by: str = "test-fixture") -> None:
        if self.settings.opsi_env == "production":
            raise OpsiControlError(ErrorCode.FORBIDDEN, "cannot seed live gate in production", status_code=403)
        await self.store.put_live_gate(
            LiveGateRecord(gate_id="v1.1-live", decision="GO", evidence_ref="test://v1.1", signed_by=signed_by)
        )

    async def get(self, campaign_id: str) -> RolloutCampaignView:
        campaign = await self._get(campaign_id)
        batches = [
            RolloutBatchView(
                batch_index=item.batch_index,
                status=BatchStatus(item.status),
                client_ids=item.client_ids,
                observe_hours=item.observe_hours,
                approved=item.approved,
            )
            for item in await self.store.list_batches(campaign_id)
        ]
        return RolloutCampaignView(
            campaign_id=campaign.campaign_id,
            name=campaign.name,
            status=CampaignStatus(campaign.status),
            revision=campaign.revision,
            snapshot_digest=campaign.snapshot_digest,
            client_count=len(campaign.client_ids),
            product_version=campaign.product_version,
            artifact_digest=campaign.artifact_digest,
            pause_cause=campaign.pause_cause or None,
            batches=batches,
            created_at=campaign.created_at,
            updated_at=campaign.updated_at,
        )

    async def list_campaigns(self) -> list[RolloutCampaignView]:
        return [await self.get(item.campaign_id) for item in await self.store.list_campaigns()]

    async def list_targets(self, campaign_id: str, minimize: bool = True) -> list[RolloutTargetView]:
        await self._get(campaign_id)
        views = []
        for item in await self.store.list_targets(campaign_id):
            client_id = item.client_id if not minimize else item.client_id.split(".")[0]
            views.append(
                RolloutTargetView(
                    client_id=client_id,
                    status=TargetStatus(item.status),
                    batch_index=item.batch_index,
                    preflight=[
                        PreflightCheckView.model_validate(row) for row in json.loads(item.preflight_json or "[]")
                    ],
                    action_id=item.action_id or None,
                    baseline_version=item.baseline_version or None,
                    baseline_digest=item.baseline_digest or None,
                    ineligible_reason=item.ineligible_reason or None,
                )
            )
        return views

    async def evidence(self, campaign_id: str) -> EvidenceManifestView:
        campaign = await self._get(campaign_id)
        events = await self.store.list_events(campaign_id)
        payload = {
            "campaignId": campaign.campaign_id,
            "snapshotDigest": campaign.snapshot_digest,
            "artifactDigest": campaign.artifact_digest,
            "gatePolicyRevision": campaign.gate_policy_revision,
            "events": [item.event for item in events],
        }
        digest = digest_payload(payload)
        return EvidenceManifestView(
            campaign_id=campaign.campaign_id,
            snapshot_digest=campaign.snapshot_digest,
            artifact_digest=campaign.artifact_digest,
            gate_policy_revision=campaign.gate_policy_revision,
            verification="implemented",
            decision="NO-GO",
            sha256=digest,
            timestamp=datetime.now(UTC),
            events=len(events),
        )

    async def metrics(self) -> MetricsView:
        campaigns = await self.store.list_campaigns()
        c_stat: dict[str, int] = {}
        b_stat: dict[str, int] = {}
        t_stat: dict[str, int] = {}
        for campaign in campaigns:
            c_stat[campaign.status] = c_stat.get(campaign.status, 0) + 1
            for batch in await self.store.list_batches(campaign.campaign_id):
                b_stat[batch.status] = b_stat.get(batch.status, 0) + 1
            for target in await self.store.list_targets(campaign.campaign_id):
                t_stat[target.status] = t_stat.get(target.status, 0) + 1
        return MetricsView(
            campaigns_by_status=c_stat,
            batches_by_status=b_stat,
            targets_by_status=t_stat,
            pause_causes=self.metric_counts["pause_causes"],
            dispatch_success=self.metric_counts["dispatch_success"],
            dispatch_failure=self.metric_counts["dispatch_failure"],
            rollback_success=self.metric_counts["rollback_success"],
            rollback_failure=self.metric_counts["rollback_failure"],
            unpublished_outbox=len(await self.store.unpublished_outbox()),
        )

    async def _auto_pause(self, campaign_id: str, cause: str) -> None:
        campaign = await self._get(campaign_id)
        if campaign.status in {s.value for s in TERMINAL_CAMPAIGN}:
            return
        expected = campaign.revision
        campaign.status = CampaignStatus.PAUSED.value
        campaign.pause_cause = cause
        campaign.fencing_token += 1
        await self.store.cas_campaign(campaign, expected)
        self.metric_counts["pause_causes"][cause] = self.metric_counts["pause_causes"].get(cause, 0) + 1
        await self._event(campaign_id, "gate-engine", "campaign.paused", cause)

    async def _assert_live_gate(self) -> None:
        gate = await self.store.get_live_gate()
        if gate is None or gate.decision != "GO":
            raise OpsiControlError(
                ErrorCode.PRECONDITION_FAILED,
                "v1.1 live gate is not GO; pilot mutation forbidden",
                status_code=412,
            )

    async def _require_dual_approval(
        self, campaign_id: str, kind: ApprovalKind, revision: int, creator_id: str
    ) -> None:
        items = [
            item
            for item in await self.store.list_approvals(campaign_id, kind.value)
            if item.campaign_revision == revision
        ]
        roles = {item.role: item.actor_id for item in items}
        if RolloutRole.RELEASE_OWNER.value not in roles or RolloutRole.ENDPOINT_OPS.value not in roles:
            raise OpsiControlError(ErrorCode.FORBIDDEN, "dual approval required", status_code=403)
        if roles[RolloutRole.RELEASE_OWNER.value] == roles[RolloutRole.ENDPOINT_OPS.value]:
            raise OpsiControlError(ErrorCode.FORBIDDEN, "creator cannot satisfy both approval roles", status_code=403)

    def _in_window(self, campaign: CampaignRecord) -> bool:
        now = datetime.now(UTC)
        if campaign.window_start and now < campaign.window_start:
            return False
        if campaign.window_end and now > campaign.window_end:
            return False
        return True

    async def _client_has_open_mutation(self, client_id: str) -> bool:
        terminal = {
            ActionStatus.SUCCEEDED,
            ActionStatus.FAILED,
            ActionStatus.CANCELLED,
            ActionStatus.UNKNOWN,
        }
        for action in await self.actions.repos.actions.list_open():
            if action.status in terminal:
                continue
            for item in await self.actions.repos.targets.list_for_request(action.request_id):
                if item.client_id == client_id and item.status not in terminal:
                    return True
        return False

    async def _get(self, campaign_id: str) -> CampaignRecord:
        record = await self.store.get_campaign(campaign_id)
        if record is None:
            raise OpsiControlError(ErrorCode.NOT_FOUND, "campaign not found", status_code=404)
        return record

    def _match(self, campaign: CampaignRecord, expected_revision: int) -> None:
        if campaign.revision != expected_revision:
            raise OpsiControlError(ErrorCode.CONFLICT, "stale campaign revision", status_code=409)

    def _require_role(self, principal: AuthPrincipal, role: RolloutRole) -> None:
        if role.value not in principal.roles and "opsi.rollout.admin" not in principal.scopes:
            if role.value.replace("_", ".") not in principal.roles:
                raise OpsiControlError(ErrorCode.FORBIDDEN, f"role {role.value} required", status_code=403)

    def _primary_role(self, principal: AuthPrincipal) -> RolloutRole:
        for role in RolloutRole:
            if role.value in principal.roles:
                return role
        raise OpsiControlError(ErrorCode.FORBIDDEN, "rollout role required", status_code=403)

    async def _event(self, campaign_id: str, actor_id: str, event: str, detail: str) -> None:
        await self.store.add_event(
            EventRecord(
                id=0,
                campaign_id=campaign_id,
                event=event,
                actor_id=actor_id,
                detail=detail[:512],
                payload_json=json.dumps(
                    {"campaignId": campaign_id, "correlationId": campaign_id, "detail": detail[:512]}
                ),
            )
        )

    async def _idempotent(
        self, actor_id: str, key: str, command: str, campaign_id: str, body: dict
    ) -> RolloutCampaignView | None:
        if not key:
            raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "Idempotency-Key required", status_code=400)
        record = IdempotencyRecord(
            key=key,
            actor_id=actor_id,
            command=command,
            campaign_id=campaign_id,
            body_digest=digest_payload(body),
            response_json="",
        )
        existing = await self.store.put_idempotency(record)
        if existing and existing.response_json:
            return RolloutCampaignView.model_validate_json(existing.response_json)
        return None

    async def _save_idempotent(
        self,
        actor_id: str,
        key: str,
        command: str,
        campaign_id: str,
        body: RolloutCreateRequest,
        view: RolloutCampaignView,
    ) -> None:
        await self.store.put_idempotency(
            IdempotencyRecord(
                key=key,
                actor_id=actor_id,
                command=command,
                campaign_id=campaign_id,
                body_digest=digest_payload(body.model_dump(by_alias=True, mode="json")),
                response_json=view.model_dump_json(by_alias=True),
            )
        )
