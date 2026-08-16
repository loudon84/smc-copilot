from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from core.auth import AuthPrincipal, digest_payload
from core.config import Settings
from core.errors import ErrorCode, OpsiControlError
from db.repositories.rollout_memory import MemoryRolloutStore
from db.repositories.rollout_records import (
    ApprovalRecord,
    AttestationRecord,
    BatchRecord,
    CampaignRecord,
    ComplianceSnapshotRecord,
    DepotLaneRecord,
    EventRecord,
    FreezeRecord,
    GateRecord,
    IdempotencyRecord,
    LiveGateRecord,
    PromotionRecord,
    RingRecord,
    RolloutTargetRecord,
)
from domain.attestation import DepotArtifactAttestation, attestation_valid
from domain.collector import InventoryStore, MemoryInventoryStore
from domain.compliance import classify
from domain.gates import CRITICAL_CAUSES, GATE_POLICY_VERSION, evaluate_campaign_gates, gate_input_digest
from domain.inventory import BaselineKind, load_inventory
from domain.policy import PRODUCTION_REENTRY_GATE, resolve_pilot_policy, satisfies_v14_gate
from domain.preflight import evaluate_target, preflight_expired
from domain.rate import CAMPAIGN_BUDGET, DEPOT_BUDGET, GLOBAL_BUDGET, fair_depot_order, strictest
from domain.rings import mapping_digest, split_rings
from domain.snapshot import MAX_DISPATCH_PER_TICK, canonicalize_client_ids, snapshot_digest, split_batches
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
    CampaignMode,
    CampaignStatus,
    ComplianceView,
    DepotAttestationRequest,
    DepotLaneStatus,
    DepotLaneView,
    DepotPauseRequest,
    EvidenceManifestView,
    FreezeClearRequest,
    FreezeView,
    MetricsView,
    PauseRequest,
    PreflightCheckView,
    ReleaseFreezeRequest,
    ResumeRequest,
    RingView,
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
        inventory: InventoryStore | None = None,
    ) -> None:
        self.store = store
        self.rpc = rpc
        self.settings = settings
        self.actions = actions
        self.inventory = inventory or MemoryInventoryStore()
        self.facts = facts if facts is not None else {}
        self.issuer_allowlist = {"opsi-lab-signer", "opsi-release-signer"}
        self.revoked_issuers: set[str] = set()

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
        policy = resolve_pilot_policy(body.pilot_policy_revision) if body.mode.value == "pilot" else None
        client_ids = canonicalize_client_ids(body.client_ids, mode=body.mode.value, policy=policy)
        active = await self.store.active_client_ids()
        overlap = [item for item in client_ids if item in active]
        if overlap:
            raise OpsiControlError(ErrorCode.CONFLICT, "client already in active campaign", status_code=409)
        mapping = await self._client_depot_mapping(client_ids)
        digest = snapshot_digest(client_ids, mode=body.mode.value, policy=policy)
        mapped = mapping_digest(mapping) if mapping else ""
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
            mode=body.mode.value,
            mapping_digest=mapped,
            freeze_revision=0,
            pilot_policy_revision=policy.revision if policy else "",
            pilot_policy_digest=policy.digest() if policy else "",
            created_at=now,
            updated_at=now,
        )
        await self.store.put_campaign(record)
        batches = []
        targets = []
        if body.mode == CampaignMode.PRODUCTION:
            rings = split_rings(mapping)
            ring_records = []
            depot_members: dict[str, list[str]] = {}
            for index, ids, hours in rings:
                ring_records.append(
                    RingRecord(
                        campaign_id=body.campaign_id,
                        ring_index=index,
                        status=BatchStatus.PENDING.value,
                        client_ids=ids,
                        observe_hours=hours,
                    )
                )
                if ids:
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
                    depot_id = mapping[client_id]
                    depot_members.setdefault(depot_id, []).append(client_id)
                    targets.append(
                        RolloutTargetRecord(
                            campaign_id=body.campaign_id,
                            client_id=client_id,
                            batch_index=index,
                            status=TargetStatus.PENDING.value,
                            depot_id=depot_id,
                            ring_index=index,
                        )
                    )
            await self.store.replace_rings(body.campaign_id, ring_records)
            await self.store.replace_depots(
                body.campaign_id,
                [
                    DepotLaneRecord(
                        campaign_id=body.campaign_id,
                        depot_id=depot_id,
                        status=DepotLaneStatus.UNATTESTED.value,
                        client_ids=members,
                        mapping_digest=mapped,
                    )
                    for depot_id, members in depot_members.items()
                ],
            )
        else:
            for index, ids, hours in split_batches(client_ids, mode=body.mode.value, policy=policy):
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
                            depot_id=mapping.get(client_id, ""),
                            ring_index=index,
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
        required_channel = (
            ArtifactChannel.STABLE.value
            if campaign.mode == CampaignMode.PRODUCTION.value
            else ArtifactChannel.PILOT.value
        )
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
                inventory=self.inventory,
                active_clients=active,
                promotion_ok=promo_ok,
                promotion_channel=channel or "missing",
                required_channel=required_channel,
                evidence_flags=self.facts.get(target.client_id, {}),
            )
            target.preflight_json = json.dumps(checks)
            target.preflight_at = datetime.now(UTC)
            target.baseline_version = baseline_version
            target.baseline_digest = baseline_digest
            snapshot = await load_inventory(rpc=self.rpc, client_id=target.client_id, store=self.inventory)
            target.baseline_owner = snapshot.owner if snapshot else ""
            conflict = bool(snapshot and snapshot.baseline_kind == BaselineKind.CONFLICT.value)
            absent_ok = bool(snapshot and snapshot.baseline_kind == BaselineKind.ABSENT.value)
            installed_owner_ok = target.baseline_owner == "opsi" or absent_ok
            if reason or conflict or not installed_owner_ok:
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
        if campaign.mode == CampaignMode.PRODUCTION.value:
            await self._assert_live_gate(PRODUCTION_REENTRY_GATE)
            await self._assert_not_frozen()
            await self._require_triple_approval(campaign_id, ApprovalKind.START, campaign.revision)
            if not await self._depots_attested(campaign):
                raise OpsiControlError(ErrorCode.PRECONDITION_FAILED, "depot attestation required", status_code=412)
        else:
            await self._assert_live_gate()
            if not self.settings.pilot_start_enabled:
                raise OpsiControlError(
                    ErrorCode.PRECONDITION_FAILED, "pilot start feature flag disabled", status_code=412
                )
            policy = resolve_pilot_policy(campaign.pilot_policy_revision or "accelerated-v1.4")
            if not satisfies_v14_gate(policy) and self.settings.opsi_env != "test":
                raise OpsiControlError(
                    ErrorCode.PRECONDITION_FAILED, "v1.4 gate requires accelerated-v1.4 policy", status_code=412
                )
            await self._require_dual_approval(campaign_id, ApprovalKind.START, campaign.revision, campaign.creator_id)
        if campaign.status != CampaignStatus.AWAITING_APPROVAL.value:
            raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "campaign cannot start", status_code=400)
        if any(item.status == TargetStatus.INELIGIBLE.value for item in await self.store.list_targets(campaign_id)):
            raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "ineligible targets block start", status_code=400)
        if any(preflight_expired(item.preflight_at) for item in await self.store.list_targets(campaign_id)):
            raise OpsiControlError(ErrorCode.PRECONDITION_FAILED, "preflight expired", status_code=412)
        promotion = await self.store.get_promotion(campaign.artifact_digest)
        if promotion is not None and promotion.signer_key_id != campaign.signer_key_id:
            security = [
                item
                for item in await self.store.list_approvals(campaign_id, ApprovalKind.START.value)
                if item.role == RolloutRole.SECURITY_OWNER.value and item.campaign_revision == campaign.revision
            ]
            if not security:
                raise OpsiControlError(ErrorCode.FORBIDDEN, "security owner approval required", status_code=403)
        required = (
            ArtifactChannel.STABLE.value
            if campaign.mode == CampaignMode.PRODUCTION.value
            else ArtifactChannel.PILOT.value
        )
        if promotion is None or promotion.channel != required:
            raise OpsiControlError(
                ErrorCode.PRECONDITION_FAILED, f"start requires {required} artifact", status_code=412
            )
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
        elif body.scope == RollbackScope.DEPOT:
            selected = [item for item in targets if item.depot_id == body.depot_id and item.mutated]
        elif body.scope == RollbackScope.RING:
            idx = body.ring_index if body.ring_index is not None else 0
            selected = [item for item in targets if item.ring_index == idx and item.mutated]
        else:
            selected = sorted(
                [item for item in targets if item.mutated],
                key=lambda item: (item.ring_index, item.depot_id),
                reverse=True,
            )
        campaign.status = CampaignStatus.ROLLING_BACK.value
        await self.store.cas_campaign(campaign, expected_revision)
        for target in selected:
            snapshot = await load_inventory(rpc=self.rpc, client_id=target.client_id, store=self.inventory)
            if snapshot is None or not target.baseline_version or len(target.baseline_digest) != 64:
                target.status = TargetStatus.ROLLBACK_FAILED.value
                await self.store.put_target(target)
                await self._auto_pause(campaign_id, "rollback_failure")
                await self.freeze(
                    ReleaseFreezeRequest(
                        freeze_id=f"frz_{campaign_id[-8:]}",
                        cause="rollback_failure",
                        reason="rollback baseline missing",
                        change_ticket="CHG-RB",
                    ),
                    principal,
                )
                return await self.get(campaign_id)
            request_id = f"req_rb_{campaign_id[-8:]}_{target.client_id[:8]}".replace(".", "")
            try:
                await self.actions.create(
                    ActionCreateRequest(
                        request_id=request_id[:80],
                        operation=Operation.UPDATE,
                        targets=[
                            TargetRef(
                                client_id=target.client_id,
                                user_binding=UserBinding(sid=snapshot.user_sid, account=snapshot.user_account),
                            )
                        ],
                        hermes_version=target.baseline_version,
                    ),
                    principal.subject,
                )
            except Exception:
                target.status = TargetStatus.ROLLBACK_FAILED.value
                await self.store.put_target(target)
                await self._auto_pause(campaign_id, "rollback_failure")
                return await self.get(campaign_id)
            target.status = TargetStatus.ROLLBACK_QUEUED.value
            target.action_id = request_id[:80]
            await self.store.put_target(target)
        await self._event(campaign_id, principal.subject, "rollback.queued", body.scope.value)
        return await self.get(campaign_id)

    async def dispatch_once(self, worker_id: str = "rollout-worker") -> int:
        handled = 0
        freeze = await self.store.get_active_freeze()
        budget = strictest(GLOBAL_BUDGET, CAMPAIGN_BUDGET, DEPOT_BUDGET)
        for campaign in await self.store.list_campaigns(limit=100):
            if campaign.status != CampaignStatus.RUNNING.value:
                continue
            lease_key = f"campaign:{campaign.campaign_id}"
            if not await self.store.claim_orchestrator(worker_id, campaign.fencing_token, lease_key):
                continue
            if freeze and freeze.active and campaign.mode == CampaignMode.PRODUCTION.value:
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
            if freeze and latest.freeze_revision != freeze.revision and campaign.mode == CampaignMode.PRODUCTION.value:
                continue
            targets = [
                item
                for item in await self.store.list_targets(campaign.campaign_id)
                if item.batch_index == ready.batch_index
            ]
            depot_order = fair_depot_order(sorted({item.depot_id for item in targets if item.depot_id}))
            ready.status = BatchStatus.DISPATCHING.value
            await self.store.put_batch(ready)
            in_flight = 0
            for depot_id in depot_order or [""]:
                depot_targets = [item for item in targets if (item.depot_id or "") == depot_id]
                for target in depot_targets:
                    if handled >= min(MAX_DISPATCH_PER_TICK, budget.max_in_flight) or in_flight >= budget.max_in_flight:
                        break
                    if target.status in {
                        TargetStatus.INELIGIBLE.value,
                        TargetStatus.SKIPPED.value,
                        TargetStatus.DISPATCHED.value,
                        TargetStatus.APPLYING.value,
                        TargetStatus.VERIFYING.value,
                        TargetStatus.HEALTHY.value,
                        TargetStatus.ROLLBACK_QUEUED.value,
                        TargetStatus.ROLLBACK_APPLYING.value,
                        TargetStatus.ROLLBACK_VERIFYING.value,
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
                        await self._auto_pause(campaign.campaign_id, "secret_canary")
                        return handled + 1
                    if fact.get("injectFailure"):
                        target.status = TargetStatus.FAILED.value
                        await self.store.put_target(target)
                        await self._auto_pause(
                            campaign.campaign_id, "canary_failure" if ready.batch_index == 0 else "injected_failure"
                        )
                        return handled + 1
                    snapshot = await load_inventory(rpc=self.rpc, client_id=target.client_id, store=self.inventory)
                    if snapshot is None:
                        target.status = TargetStatus.INELIGIBLE.value
                        target.ineligible_reason = "authoritative_inventory"
                        await self.store.put_target(target)
                        continue
                    request_id = f"req_ro_{campaign.campaign_id[4:12]}_{target.client_id.split('.')[0]}"[:80]
                    await self.actions.create(
                        ActionCreateRequest(
                            request_id=request_id,
                            operation=Operation.UPDATE,
                            targets=[
                                TargetRef(
                                    client_id=target.client_id,
                                    user_binding=UserBinding(sid=snapshot.user_sid, account=snapshot.user_account),
                                )
                            ],
                            hermes_version=campaign.product_version,
                        ),
                        "rollout-worker",
                    )
                    target.status = TargetStatus.DISPATCHED.value
                    target.action_id = request_id
                    target.mutated = True
                    await self.store.put_target(target)
                    handled += 1
                    in_flight += 1
            ready.dispatched = True
            ready.status = BatchStatus.VERIFYING.value
            await self.store.put_batch(ready)
            decision, cause, reason = evaluate_campaign_gates(
                targets=await self.store.list_targets(campaign.campaign_id),
                batch_index=ready.batch_index,
                ring_index=ready.batch_index,
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
            if decision in {"PAUSE", "FREEZE"}:
                await self._auto_pause(campaign.campaign_id, cause)
                if decision == "FREEZE" or cause in CRITICAL_CAUSES:
                    await self._force_freeze(campaign.campaign_id, cause)
            else:
                ready.status = BatchStatus.OBSERVING.value
                ready.observe_until = datetime.now(UTC) + timedelta(hours=ready.observe_hours)
                await self.store.put_batch(ready)
        return handled

    async def promote(self, body: ArtifactPromoteRequest, principal: AuthPrincipal) -> dict[str, str]:
        if body.to_channel == ArtifactChannel.STABLE:
            await self._assert_live_gate(PRODUCTION_REENTRY_GATE)
            existing = await self.store.get_promotion(body.digest)
            if existing is None or existing.channel != ArtifactChannel.PILOT.value or existing.digest != body.digest:
                raise OpsiControlError(
                    ErrorCode.PRECONDITION_FAILED, "stable requires matching pilot digest", status_code=412
                )
            if RolloutRole.SECURITY_OWNER.value in principal.roles:
                await self.store.add_approval(
                    ApprovalRecord(
                        id=0,
                        campaign_id=f"promo:{body.digest}",
                        kind=ApprovalKind.PROMOTE.value,
                        actor_id=principal.subject,
                        role=RolloutRole.SECURITY_OWNER.value,
                        campaign_revision=1,
                        reason=body.reason,
                    )
                )
                return {"digest": body.digest, "channel": existing.channel, "status": "awaiting_release"}
            self._require_role(principal, RolloutRole.RELEASE_OWNER)
            approvals = await self.store.list_approvals(f"promo:{body.digest}", ApprovalKind.PROMOTE.value)
            if not any(item.role == RolloutRole.SECURITY_OWNER.value for item in approvals):
                raise OpsiControlError(ErrorCode.FORBIDDEN, "security owner approval required", status_code=403)
        else:
            self._require_role(principal, RolloutRole.RELEASE_OWNER)
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
            await self._force_freeze("artifact", "artifact_conflict")
            for campaign in await self.store.list_campaigns(limit=100):
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
            mode=CampaignMode(campaign.mode or CampaignMode.PILOT.value),
            revision=campaign.revision,
            snapshot_digest=campaign.snapshot_digest,
            mapping_digest=campaign.mapping_digest or None,
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
                    depot_id=item.depot_id or None,
                    ring_index=item.ring_index,
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
            "schema": "smc.opsi.evidence-manifest.v2",
            "campaignId": campaign.campaign_id,
            "snapshotDigest": campaign.snapshot_digest,
            "mappingDigest": campaign.mapping_digest,
            "artifactDigest": campaign.artifact_digest,
            "gatePolicyRevision": campaign.gate_policy_revision,
            "freezeRevision": campaign.freeze_revision,
            "events": [item.event for item in events],
        }
        digest = digest_payload(payload)
        return EvidenceManifestView(
            schema_="smc.opsi.evidence-manifest.v2",
            campaign_id=campaign.campaign_id,
            snapshot_digest=campaign.snapshot_digest,
            artifact_digest=campaign.artifact_digest,
            gate_policy_revision=campaign.gate_policy_revision,
            verification="implemented",
            decision="NO-GO",
            sha256=digest,
            timestamp=datetime.now(UTC),
            events=len(events),
            mapping_digest=campaign.mapping_digest or None,
            freeze_revision=campaign.freeze_revision,
        )

    async def metrics(self) -> MetricsView:
        campaigns = await self.store.list_campaigns()
        c_stat: dict[str, int] = {}
        b_stat: dict[str, int] = {}
        t_stat: dict[str, int] = {}
        pause_causes: dict[str, int] = {}
        dispatch_success = 0
        dispatch_failure = 0
        rollback_success = 0
        rollback_failure = 0
        for campaign in campaigns:
            c_stat[campaign.status] = c_stat.get(campaign.status, 0) + 1
            for batch in await self.store.list_batches(campaign.campaign_id):
                b_stat[batch.status] = b_stat.get(batch.status, 0) + 1
            for target in await self.store.list_targets(campaign.campaign_id):
                t_stat[target.status] = t_stat.get(target.status, 0) + 1
                if target.status == TargetStatus.DISPATCHED.value or target.status in {
                    TargetStatus.APPLYING.value,
                    TargetStatus.VERIFYING.value,
                    TargetStatus.HEALTHY.value,
                }:
                    dispatch_success += 1
                if target.status == TargetStatus.FAILED.value:
                    dispatch_failure += 1
                if target.status == TargetStatus.ROLLED_BACK.value:
                    rollback_success += 1
                if target.status == TargetStatus.ROLLBACK_FAILED.value:
                    rollback_failure += 1
            for event in await self.store.list_events(campaign.campaign_id):
                if event.event == "campaign.paused" and event.detail:
                    pause_causes[event.detail] = pause_causes.get(event.detail, 0) + 1
        freeze = await self.store.get_active_freeze()
        return MetricsView(
            campaigns_by_status=c_stat,
            batches_by_status=b_stat,
            targets_by_status=t_stat,
            pause_causes=pause_causes,
            dispatch_success=dispatch_success,
            dispatch_failure=dispatch_failure,
            rollback_success=rollback_success,
            rollback_failure=rollback_failure,
            unpublished_outbox=len(await self.store.unpublished_outbox()),
            freeze_active=bool(freeze and freeze.active),
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
        await self._event(campaign_id, "gate-engine", "campaign.paused", cause)

    async def _assert_live_gate(self, gate_id: str = "v1.1-live") -> None:
        gate = await self.store.get_live_gate(gate_id)
        if gate is None or gate.decision != "GO":
            raise OpsiControlError(
                ErrorCode.PRECONDITION_FAILED,
                f"{gate_id} live gate is not GO; mutation forbidden",
                status_code=412,
            )

    async def _assert_not_frozen(self) -> None:
        freeze = await self.store.get_active_freeze()
        if freeze and freeze.active:
            raise OpsiControlError(ErrorCode.PRECONDITION_FAILED, "global freeze active", status_code=412)

    async def _require_triple_approval(self, campaign_id: str, kind: ApprovalKind, revision: int) -> None:
        items = [
            item
            for item in await self.store.list_approvals(campaign_id, kind.value)
            if item.campaign_revision == revision
        ]
        roles = {item.role for item in items}
        required = {
            RolloutRole.RELEASE_OWNER.value,
            RolloutRole.ENDPOINT_OPS.value,
            RolloutRole.SECURITY_OWNER.value,
        }
        if not required.issubset(roles):
            raise OpsiControlError(ErrorCode.FORBIDDEN, "triple approval required", status_code=403)

    async def _depots_attested(self, campaign: CampaignRecord) -> bool:
        now = datetime.now(UTC)
        for depot in await self.store.list_depots(campaign.campaign_id):
            record = await self.store.get_attestation(depot.depot_id, campaign.artifact_digest)
            if record is None or record.revoked:
                return False
            item = DepotArtifactAttestation(
                depot_id=record.depot_id,
                product_id=record.product_id,
                product_version=record.product_version,
                package_version=record.package_version,
                artifact_digest=record.artifact_digest,
                issuer=record.issuer,
                generated_at=record.generated_at,
                expires_at=record.expires_at,
                signature=record.signature,
                evidence_ref=record.evidence_ref,
            )
            if not attestation_valid(
                item,
                now=now,
                allowlist=self.issuer_allowlist,
                revoked=self.revoked_issuers,
                expected_digest=campaign.artifact_digest,
                expected_version=campaign.product_version,
                expected_package=campaign.package_version,
            ):
                return False
        return True

    async def _client_depot_mapping(self, client_ids: list[str]) -> dict[str, str]:
        mapping: dict[str, str] = {}
        for client_id in client_ids:
            snapshot = await load_inventory(rpc=self.rpc, client_id=client_id, store=self.inventory)
            depot_id = snapshot.depot_id if snapshot else ""
            if depot_id:
                mapping[client_id] = depot_id
        return mapping

    async def _force_freeze(self, source: str, cause: str) -> None:
        existing = await self.store.get_active_freeze()
        revision = (existing.revision + 1) if existing else 1
        await self.store.put_freeze(
            FreezeRecord(
                freeze_id=existing.freeze_id if existing else f"frz_{source[:8]}",
                revision=revision,
                active=True,
                cause=cause,
                actor_id="gate-engine",
            )
        )
        await self._event(source if source.startswith("cmp_") else "global", "gate-engine", "freeze.set", cause)

    async def reconcile_once(self, worker_id: str = "rollout-reconciler") -> int:
        progressed = 0
        for campaign in await self.store.list_campaigns(limit=100):
            if campaign.status not in {
                CampaignStatus.RUNNING.value,
                CampaignStatus.ROLLING_BACK.value,
                CampaignStatus.OBSERVING.value,
            }:
                continue
            if not await self.store.claim_orchestrator(
                worker_id, campaign.fencing_token, f"reconcile:{campaign.campaign_id}"
            ):
                continue
            for target in await self.store.list_targets(campaign.campaign_id):
                fact = self.facts.get(target.client_id, {})
                if target.status == TargetStatus.DISPATCHED.value:
                    target.status = TargetStatus.APPLYING.value
                    await self.store.put_target(target)
                    progressed += 1
                    continue
                if target.status == TargetStatus.APPLYING.value:
                    target.status = TargetStatus.VERIFYING.value
                    await self.store.put_target(target)
                    progressed += 1
                    continue
                if target.status == TargetStatus.VERIFYING.value:
                    if (
                        fact.get("resultChecksum")
                        and fact.get("productReadback")
                        and fact.get("gatewayProbe")
                        and fact.get("workSmoke")
                    ):
                        target.status = TargetStatus.HEALTHY.value
                    elif fact.get("unknownResult"):
                        target.status = TargetStatus.UNKNOWN_BLOCKED.value
                    await self.store.put_target(target)
                    progressed += 1
                    continue
                if target.status == TargetStatus.ROLLBACK_QUEUED.value:
                    target.status = TargetStatus.ROLLBACK_APPLYING.value
                    await self.store.put_target(target)
                    progressed += 1
                    continue
                if target.status == TargetStatus.ROLLBACK_APPLYING.value:
                    target.status = TargetStatus.ROLLBACK_VERIFYING.value
                    await self.store.put_target(target)
                    progressed += 1
                    continue
                if target.status == TargetStatus.ROLLBACK_VERIFYING.value:
                    if fact.get("rollbackReadback") and fact.get("gatewayProbe") and fact.get("workSmoke"):
                        target.status = TargetStatus.ROLLED_BACK.value
                    elif fact.get("unknownResult"):
                        target.status = TargetStatus.UNKNOWN_BLOCKED.value
                    await self.store.put_target(target)
                    progressed += 1
        return progressed

    async def freeze(self, body: ReleaseFreezeRequest, principal: AuthPrincipal) -> FreezeView:
        record = FreezeRecord(
            freeze_id=body.freeze_id,
            revision=1,
            active=True,
            cause=body.cause,
            actor_id=principal.subject,
        )
        existing = await self.store.get_freeze(body.freeze_id)
        if existing:
            record.revision = existing.revision + 1
        await self.store.put_freeze(record)
        await self._event("global", principal.subject, "freeze.set", body.cause)
        return FreezeView(
            freeze_id=record.freeze_id,
            revision=record.revision,
            active=True,
            cause=record.cause,
            actor_id=record.actor_id,
        )

    async def clear_freeze(self, freeze_id: str, body: FreezeClearRequest, principal: AuthPrincipal) -> FreezeView:
        record = await self.store.get_freeze(freeze_id)
        if record is None or not record.active:
            raise OpsiControlError(ErrorCode.NOT_FOUND, "freeze not found", status_code=404)
        await self._require_dual_approval(
            "freeze:" + freeze_id, ApprovalKind.FREEZE_CLEAR, record.revision, record.actor_id
        )
        if not body.root_cause_closed:
            raise OpsiControlError(ErrorCode.PRECONDITION_FAILED, "root cause still open", status_code=412)
        record.active = False
        record.cleared_by = principal.subject
        record.revision += 1
        await self.store.put_freeze(record)
        await self._event("global", principal.subject, "freeze.cleared", freeze_id)
        return FreezeView(
            freeze_id=record.freeze_id,
            revision=record.revision,
            active=False,
            cause=record.cause,
            actor_id=record.actor_id,
        )

    async def attest_depot(self, body: DepotAttestationRequest, principal: AuthPrincipal) -> dict[str, str]:
        if body.issuer not in self.issuer_allowlist:
            raise OpsiControlError(ErrorCode.FORBIDDEN, "attestation issuer not allowlisted", status_code=403)
        item = DepotArtifactAttestation(
            depot_id=body.depot_id,
            product_id=body.product_id,
            product_version=body.product_version,
            package_version=body.package_version,
            artifact_digest=body.artifact_digest,
            issuer=body.issuer,
            generated_at=body.generated_at,
            expires_at=body.expires_at,
            signature=body.signature,
            evidence_ref=body.evidence_ref,
        )
        if not attestation_valid(
            item,
            now=datetime.now(UTC),
            allowlist=self.issuer_allowlist,
            revoked=self.revoked_issuers,
            expected_digest=body.artifact_digest,
            expected_version=body.product_version,
            expected_package=body.package_version,
        ):
            raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "attestation invalid", status_code=400)
        await self.store.put_attestation(
            AttestationRecord(
                depot_id=body.depot_id,
                product_id=body.product_id,
                product_version=body.product_version,
                package_version=body.package_version,
                artifact_digest=body.artifact_digest,
                issuer=body.issuer,
                generated_at=body.generated_at,
                expires_at=body.expires_at,
                signature=body.signature,
                evidence_ref=body.evidence_ref,
            )
        )
        return {"depotId": body.depot_id, "digest": item.digest()}

    async def list_depots(self, campaign_id: str) -> list[DepotLaneView]:
        await self._get(campaign_id)
        return [
            DepotLaneView(
                depot_id=item.depot_id,
                status=DepotLaneStatus(item.status),
                client_count=len(item.client_ids),
                mapping_digest=item.mapping_digest,
                timezone=item.timezone,
            )
            for item in await self.store.list_depots(campaign_id)
        ]

    async def list_rings(self, campaign_id: str) -> list[RingView]:
        await self._get(campaign_id)
        return [
            RingView(
                ring_index=item.ring_index,
                status=BatchStatus(item.status),
                client_ids=item.client_ids,
                observe_hours=item.observe_hours,
                approved=item.approved,
            )
            for item in await self.store.list_rings(campaign_id)
        ]

    async def pause_depot(
        self, campaign_id: str, depot_id: str, body: DepotPauseRequest, principal: AuthPrincipal, expected_revision: int
    ) -> RolloutCampaignView:
        campaign = await self._get(campaign_id)
        self._match(campaign, expected_revision)
        for depot in await self.store.list_depots(campaign_id):
            if depot.depot_id == depot_id:
                depot.status = DepotLaneStatus.PAUSED.value
                await self.store.put_depot(depot)
        await self._event(campaign_id, principal.subject, "depot.paused", depot_id)
        return await self.get(campaign_id)

    async def resume_depot(
        self, campaign_id: str, depot_id: str, body: ResumeRequest, principal: AuthPrincipal, expected_revision: int
    ) -> RolloutCampaignView:
        campaign = await self._get(campaign_id)
        self._match(campaign, expected_revision)
        await self._require_dual_approval(
            campaign_id, ApprovalKind.DEPOT_RESUME, campaign.revision, campaign.creator_id
        )
        for depot in await self.store.list_depots(campaign_id):
            if depot.depot_id == depot_id:
                depot.status = DepotLaneStatus.RUNNING.value
                await self.store.put_depot(depot)
        await self._event(campaign_id, principal.subject, "depot.resumed", depot_id)
        return await self.get(campaign_id)

    async def approve_ring(
        self, campaign_id: str, ring_index: int, body: ApproveRequest, principal: AuthPrincipal, expected_revision: int
    ) -> RolloutCampaignView:
        await self._assert_live_gate(PRODUCTION_REENTRY_GATE)
        body.kind = ApprovalKind.NEXT_RING
        await self.approve(campaign_id, body, principal, expected_revision)
        campaign = await self._get(campaign_id)
        await self._require_triple_approval(campaign_id, ApprovalKind.NEXT_RING, campaign.revision)
        for ring in await self.store.list_rings(campaign_id):
            if ring.ring_index == ring_index:
                ring.approved = True
                ring.status = BatchStatus.READY.value
                await self.store.put_ring(ring)
        batches = await self.store.list_batches(campaign_id)
        for batch in batches:
            if batch.batch_index == ring_index:
                batch.approved = True
                batch.status = BatchStatus.READY.value
                await self.store.put_batch(batch)
        return await self.get(campaign_id)

    async def fleet_compliance(self, campaign_id: str) -> list[ComplianceView]:
        campaign = await self._get(campaign_id)
        rows: list[ComplianceView] = []
        for target in await self.store.list_targets(campaign_id):
            fact = self.facts.get(target.client_id, {})
            observed_version = str(fact.get("observedVersion") or target.baseline_version)
            observed_digest = str(fact.get("observedDigest") or target.baseline_digest)
            status, critical = classify(
                desired_version=campaign.product_version,
                observed_version=observed_version,
                desired_digest=campaign.artifact_digest,
                observed_digest=observed_digest,
                owner=str(fact.get("owner") or ""),
                health="healthy" if target.status == TargetStatus.HEALTHY.value else "unknown",
                stale=bool(fact.get("stale")),
                exempt=bool(fact.get("exempt")),
            )
            payload = {
                "clientId": target.client_id,
                "depotId": target.depot_id,
                "status": status.value,
                "desired": campaign.product_version,
                "observed": observed_version,
            }
            digest = digest_payload(payload)
            rows.append(
                ComplianceView(
                    client_id=target.client_id.split(".")[0],
                    depot_id=target.depot_id,
                    status=status.value,
                    observed_at=datetime.now(UTC),
                    digest=digest,
                    critical=critical,
                )
            )
        await self.store.put_compliance(
            ComplianceSnapshotRecord(
                snapshot_id=f"cmpc_{campaign.campaign_id[-12:]}",
                campaign_id=campaign.campaign_id,
                payload_json=json.dumps([row.model_dump(by_alias=True, mode="json") for row in rows]),
                digest=digest_payload({"campaignId": campaign.campaign_id, "count": len(rows)}),
            )
        )
        return rows

    async def list_fleet_compliance(self, *, cursor: str | None = None, limit: int = 50) -> dict:
        items = await self.store.list_compliance(cursor=cursor, limit=limit)
        next_cursor = items[-1].snapshot_id if len(items) == limit else None
        return {
            "items": [
                {"snapshotId": item.snapshot_id, "campaignId": item.campaign_id, "digest": item.digest}
                for item in items
            ],
            "nextCursor": next_cursor,
        }

    async def seed_production_gate_for_test(self, signed_by: str = "test-fixture") -> None:
        if self.settings.opsi_env == "production":
            raise OpsiControlError(ErrorCode.FORBIDDEN, "cannot seed live gate in production", status_code=403)
        await self.store.put_live_gate(
            LiveGateRecord(gate_id="v1.2-production", decision="GO", evidence_ref="test://v1.2", signed_by=signed_by)
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
