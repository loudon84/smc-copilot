from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from crypto_fixtures import signed_client_deployment_gate, signed_controller_gate, signed_reentry_gate
from fastapi.testclient import TestClient

from app import build_test_state, create_app
from core.errors import OpsiControlError
from domain.policy import CLIENT_DEPLOYMENT_GATE, CONTROLLER_GATE, PRODUCTION_REENTRY_GATE
from schemas.models import Operation
from workers.action_dispatcher import dispatch_target


def _auth(token, *roles: str, subject: str = "ops", idem: str = "idem-v17") -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token(subject=subject, roles=list(roles))}",
        "Idempotency-Key": idem,
    }


def test_setup_allows_distinct_product_and_hermes_versions():
    state = build_test_state()
    state.rpc.products = [
        {
            "productId": "smc-hermes-agent",
            "productVersion": "1.7.0",
            "packageVersion": "1",
            "depotId": "depot.example",
        }
    ]
    digest = asyncio.run(
        dispatch_target(
            rpc=state.rpc,
            product_id="smc-hermes-agent",
            request_id="req_v17setup01",
            client_id="client-a.example",
            operation=Operation.SETUP,
            hermes_version="0.22.0",
            config_revision=None,
            auto_repair_level=1,
            user_sid="S-1-5-21-1-2-3-1001",
            user_account="lab\\user-a",
        )
    )
    assert len(digest) == 64


def test_catalog_rejects_unknown_hermes_version():
    state = build_test_state()
    asyncio.run(
        state.inventory_store.put_product_release(
            "smc-hermes-agent",
            {
                "productVersion": "1.7.0",
                "packageVersion": "1",
                "controllerRevision": "2",
                "controller": {"revision": "2", "bundleDigest": "ab" * 32},
                "runtimes": [{"version": "0.22.0", "controllerCompat": ">=2"}],
                "canonicalDigest": "cd" * 32,
                "signerKeyId": "smc-opsi-release-ed25519-v1",
                "verified": True,
                "liveEligible": False,
            },
        )
    )
    try:
        asyncio.run(
            dispatch_target(
                rpc=state.rpc,
                product_id="smc-hermes-agent",
                request_id="req_v17badver1",
                client_id="client-a.example",
                operation=Operation.SETUP,
                hermes_version="9.9.9",
                config_revision=None,
                auto_repair_level=1,
                user_sid="S-1-5-21-1-2-3-1001",
                user_account="lab\\user-a",
                release=asyncio.run(state.inventory_store.get_product_release("smc-hermes-agent")),
            )
        )
        raise AssertionError("unknown hermes must fail catalog check")
    except OpsiControlError as exc:
        assert exc.status_code == 400
        assert "catalog" in exc.message


def test_smoke_release_cannot_be_live_eligible():
    state = build_test_state()
    try:
        asyncio.run(
            state.inventory_store.put_product_release(
                "smc-hermes-agent",
                {
                    "productVersion": "1.7.0",
                    "packageVersion": "1",
                    "signerKeyId": "TEST-ONLY-ed25519",
                    "liveEligible": True,
                    "runtimes": [{"version": "0.22.0"}],
                },
            )
        )
        raise AssertionError("smoke live-eligible must fail")
    except ValueError as exc:
        assert "smoke" in str(exc)


def test_smoke_evidence_cannot_import_v17_go(token):
    state = build_test_state()
    client = TestClient(create_app(state))
    body = signed_client_deployment_gate(evidence_ref="test://smoke")
    resp = client.post(
        "/api/v1/opsi/live-gates/import",
        headers=_auth(token, "security_owner"),
        json=body,
    )
    assert resp.status_code == 400
    assert "smoke" in resp.text.lower() or "fixture" in resp.text.lower()


def test_production_mutation_requires_v17_gate(token):
    state = build_test_state()
    client = TestClient(create_app(state))
    for body, key in (
        (signed_reentry_gate(), "re"),
        (signed_controller_gate(), "ctrl"),
    ):
        resp = client.post(
            "/api/v1/opsi/live-gates/import",
            headers=_auth(token, "security_owner", idem=key),
            json=body,
        )
        assert resp.status_code == 200, resp.text
    try:
        asyncio.run(state.rollouts._assert_production_mutation_gates())
        raise AssertionError("v1.7 gate must block")
    except OpsiControlError as exc:
        assert exc.status_code == 412
        assert CLIENT_DEPLOYMENT_GATE in str(exc)
    imported = client.post(
        "/api/v1/opsi/live-gates/import",
        headers=_auth(token, "security_owner", idem="v17"),
        json=signed_client_deployment_gate(),
    )
    assert imported.status_code == 200, imported.text
    asyncio.run(state.rollouts._assert_production_mutation_gates())


def test_release_view_roundtrip(token):
    state = build_test_state()
    client = TestClient(create_app(state))
    put = client.put(
        "/api/v1/opsi/products/releases",
        headers=_auth(token, "release_owner"),
        json={
            "schema": "smc.opsi.product-release.v1",
            "productId": "smc-hermes-agent",
            "productVersion": "1.7.0",
            "packageVersion": "1",
            "controller": {"revision": "2", "manifestSha256": "aa" * 32, "bundleDigest": "bb" * 32},
            "runtimes": [
                {
                    "version": "0.22.0",
                    "manifestSha256": "cc" * 32,
                    "artifactSha256": "dd" * 32,
                    "controllerCompat": ">=2",
                }
            ],
            "verifier": {"platform": "windows-amd64", "sha256": "ee" * 32},
            "sourceRevision": "a448eb4aca963024771335de1e37fd0053b438c3",
            "buildId": "build-test",
            "createdAt": datetime.now(UTC).isoformat(),
            "canonicalDigest": "ff" * 32,
            "signerKeyId": "smc-opsi-release-ed25519-v1",
            "signature": "ab" * 32,
            "liveEligible": False,
            "verified": True,
        },
    )
    assert put.status_code == 200, put.text
    listed = client.get("/api/v1/opsi/products", headers=_auth(token, "release_owner")).json()
    assert any(item.get("productVersion") == "1.7.0" for item in listed["items"])
    assert any(item.get("runtimeVersions") == ["0.22.0"] for item in listed["items"] if item.get("runtimeVersions"))


def test_openapi_exposes_release_routes():
    app = create_app(build_test_state())
    paths = app.openapi()["paths"]
    assert "/api/v1/opsi/products/releases" in paths
    assert app.openapi()["info"]["version"] == "1.8.0"
    assert PRODUCTION_REENTRY_GATE
    assert CONTROLLER_GATE
    assert CLIENT_DEPLOYMENT_GATE
