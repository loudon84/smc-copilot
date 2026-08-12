from __future__ import annotations

import pytest
from pydantic import ValidationError

from app import build_lab_state, build_test_state
from core.auth import mint_lab_jwt
from core.config import Settings


def test_prod_301_rejects_placeholder_production_settings():
    with pytest.raises((ValueError, ValidationError)):
        Settings(
            salt_env="production",
            jwt_lab_secret="lab-only-change-me",
            salt_masters="salt-a.internal",
            salt_master_fingerprints="sha256:master-a",
        )


def test_prod_301_rejects_http_salt_api():
    with pytest.raises((ValueError, ValidationError)):
        Settings(
            salt_env="production",
            jwt_lab_secret="prod-secret-not-lab",
            oidc_issuer="https://idp.example/realms/smc",
            oidc_jwks_url="https://idp.example/realms/smc/protocol/openid-connect/certs",
            salt_masters="192.168.102.104",
            salt_master_fingerprints="sha256:" + ("ab" * 32),
            salt_api_urls="http://192.168.102.104:8000",
            salt_api_username="salt",
            salt_api_password="secret",
            management_backend_url="https://backend.example",
            artifact_store_url="https://artifacts.example",
            secret_provider_url="https://secrets.example",
            artifact_key_id="k1",
            artifact_public_key="pubkey",
        )


def test_lab_jwt_forbidden_in_production_mint():
    settings = Settings.model_construct(
        salt_env="production",
        jwt_lab_secret="prod-secret-not-lab",
        jwt_issuer="smc-salt-control",
        jwt_audience="salt-control",
    )
    with pytest.raises(Exception):
        mint_lab_jwt(subject="x", scopes=["salt.master"], settings=settings)


def test_build_test_and_lab_states():
    test_state = build_test_state(Settings(salt_env="test", jwt_lab_secret="test-secret"))
    assert type(test_state.repos.endpoints).__name__.startswith("InMemory")
    lab_state = build_lab_state(Settings(salt_env="lab", jwt_lab_secret="lab-secret"))
    assert lab_state.settings.salt_env == "lab"
