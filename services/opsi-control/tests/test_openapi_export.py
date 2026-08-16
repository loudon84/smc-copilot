from __future__ import annotations

import pytest
from pydantic import ValidationError

from app import build_test_state, create_app
from core.config import Settings


def test_production_rejects_placeholders():
    with pytest.raises((ValueError, ValidationError)):
        Settings(opsi_env="production", jwt_lab_secret="lab-only-change-me")


def test_production_rejects_http_rpc():
    with pytest.raises((ValueError, ValidationError)):
        Settings(
            opsi_env="production",
            jwt_lab_secret="prod-secret-not-lab",
            oidc_issuer="https://idp.example/realms/smc",
            oidc_jwks_url="https://idp.example/realms/smc/certs",
            opsi_rpc_url="http://opsi.example:4447/rpc",
            opsi_rpc_username="u",
            opsi_rpc_password_ref="OPSI_RPC_PASSWORD",
            secret_provider_url="https://vault.example/v1/secret",
        )


def test_test_state_refuses_production_env():
    from app import build_test_state

    with pytest.raises(ValueError):
        build_test_state(
            Settings(
                opsi_env="production",
                jwt_lab_secret="x",
                oidc_issuer="https://i",
                oidc_jwks_url="https://j",
                opsi_rpc_url="https://opsi.example/rpc",
                opsi_rpc_username="u",
                opsi_rpc_password="p",
            )
        )


def test_openapi_export_stable():
    app = create_app(build_test_state())
    first = app.openapi()
    second = app.openapi()
    assert first == second
    paths = first.get("paths", {})
    assert "/health" in paths
    assert "/api/v1/opsi/actions" in paths
    assert "/api/v1/opsi/clients" in paths
    assert "/api/v1/opsi/products" in paths
    assert "/api/v1/opsi/policies/apply" in paths
    assert "/api/v1/opsi/diagnostics/{request_id}" in paths
    assert "/api/v1/opsi/rollouts" in paths
    assert first["info"]["version"] == "1.6.0"
