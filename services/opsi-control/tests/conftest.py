from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import build_test_state, create_app
from core.auth import Scope, mint_lab_jwt
from core.config import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(opsi_env="test", jwt_lab_secret="test-secret-test-secret-test-sec32")


@pytest.fixture
def state(settings):
    return build_test_state(settings)


@pytest.fixture
def client(state):
    return TestClient(create_app(state))


@pytest.fixture
def token(settings):
    def _mint(*scopes: str, subject: str = "ops", roles: list[str] | None = None) -> str:
        wanted = list(scopes) or [scope.value for scope in Scope]
        return mint_lab_jwt(subject=subject, scopes=wanted, settings=settings, roles=roles)

    return _mint
