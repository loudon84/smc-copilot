from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from crypto_fixtures import signed_controller_gate, signed_reentry_gate
from fastapi.testclient import TestClient

from app import build_test_state, create_app
from core.auth import AuthPrincipal
from core.errors import OpsiControlError
from domain.policy import CONTROLLER_GATE, PRODUCTION_REENTRY_GATE
from schemas.models import ActionCreateRequest, Operation, TargetRef
from schemas.rollout import ArtifactChannel, ArtifactPromoteRequest, RolloutRole


def _auth(token, *roles: str, subject: str = "ops", idem: str = "idem-v16") -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token(subject=subject, roles=list(roles))}",
        "Idempotency-Key": idem,
    }


def test_client_state_without_controller_evidence_is_unknown(token):
    state = build_test_state()
    client = TestClient(create_app(state))
    body = client.get(
        "/api/v1/opsi/clients/client-a.example/state",
        headers=_auth(token, "release_owner"),
    ).json()
    assert body["schema"] == "smc.opsi.endpoint-controller-state.v2"
    assert body["health"] == "UNKNOWN"
    assert body["owner"] == ""
    assert body["stale"] is True
    assert body["health"] != "HEALTHY"


def test_controller_evidence_makes_state_healthy(token):
    state = build_test_state()
    client = TestClient(create_app(state))
    put = client.put(
        "/api/v1/opsi/clients/client-a.example/controller-evidence",
        headers=_auth(token, "release_owner"),
        json={
            "schema": "smc.opsi.endpoint-controller-state.v2",
            "owner": "opsi",
            "health": "HEALTHY",
            "controllerRevision": "1",
            "controllerDigest": "ab" * 32,
            "runtimeVersion": "0.22.0",
            "runtimeDigest": "cd" * 32,
            "transactionPhase": "finalized",
            "gatewayReachable": True,
            "observedAt": datetime.now(UTC).isoformat(),
        },
    )
    assert put.status_code == 200, put.text
    body = put.json()
    assert body["health"] == "HEALTHY"
    assert body["owner"] == "opsi"
    details = client.get(
        "/api/v1/opsi/clients/client-a.example/controller",
        headers=_auth(token, "release_owner"),
    ).json()
    assert details["redacted"] is True
    assert details["revision"] == "1"


def test_production_mutation_requires_controller_gate(token):
    state = build_test_state()
    client = TestClient(create_app(state))
    imported = client.post(
        "/api/v1/opsi/live-gates/import",
        headers=_auth(token, "security_owner", idem="reentry"),
        json=signed_reentry_gate(),
    )
    assert imported.status_code == 200, imported.text
    pytest_raises_gate(state, CONTROLLER_GATE)
    ctrl = client.post(
        "/api/v1/opsi/live-gates/import",
        headers=_auth(token, "security_owner", idem="ctrl"),
        json=signed_controller_gate(),
    )
    assert ctrl.status_code == 200, ctrl.text
    asyncio.run(state.rollouts._assert_production_mutation_gates())


def pytest_raises_gate(state, gate_id: str) -> None:
    try:
        asyncio.run(state.rollouts._assert_production_mutation_gates())
        raise AssertionError(f"{gate_id} should block production mutation")
    except OpsiControlError as exc:
        assert exc.status_code == 412
        assert gate_id in str(exc)


def test_reconcile_controller_and_state_refresh_create_actions(token):
    state = build_test_state()
    client = TestClient(create_app(state))
    rec = client.post(
        "/api/v1/opsi/clients/client-a.example/controller/reconcile",
        headers=_auth(token, "release_owner", idem="rc"),
    )
    assert rec.status_code == 200, rec.text
    assert rec.json()["operation"] == "reconcile-controller"
    refresh = client.post(
        "/api/v1/opsi/clients/client-a.example/state-refresh",
        headers=_auth(token, "release_owner", idem="sr"),
    )
    assert refresh.status_code == 200, refresh.text
    assert refresh.json()["accepted"] is True
    created = ActionCreateRequest(
        request_id="req_reconcile01",
        operation=Operation.RECONCILE_CONTROLLER,
        targets=[TargetRef(client_id="client-a.example")],
    )
    assert created.operation == Operation.RECONCILE_CONTROLLER


def test_stable_promote_requires_both_gates():
    state = build_test_state()
    principal = AuthPrincipal(
        subject="ops",
        principal_type="user",
        scopes=frozenset({"opsi.rollout.admin"}),
        roles=frozenset({RolloutRole.RELEASE_OWNER.value, RolloutRole.SECURITY_OWNER.value}),
    )
    try:
        asyncio.run(
            state.rollouts.promote(
                ArtifactPromoteRequest.model_validate(
                    {
                        "reason": "stable",
                        "changeTicket": "CHG-16",
                        "productVersion": "0.22.0",
                        "digest": "aa" * 32,
                        "signerKeyId": "lab-signer",
                        "fromChannel": ArtifactChannel.PILOT,
                        "toChannel": ArtifactChannel.STABLE,
                        "evidenceRef": "test://stable",
                    }
                ),
                principal,
            )
        )
        raise AssertionError("stable promote must require live gates")
    except OpsiControlError as exc:
        assert exc.status_code == 412
        assert PRODUCTION_REENTRY_GATE in str(exc) or CONTROLLER_GATE in str(exc)
