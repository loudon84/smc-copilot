from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import AppState, create_app
from core.auth import Scope, hash_secret, mint_lab_jwt
from core.config import Settings
from core.idempotency import IdempotencyStore
from db.repositories.interfaces import BindingRecord, PendingTokenRecord
from db.repositories.memory import build_in_memory_repos
from integrations.artifact_store import FakeArtifactStore
from integrations.management_backend import FakeManagementBackend
from integrations.salt_master import FakeSaltMaster
from integrations.secret_provider import FakeSecretProvider
from services.artifact_service import ArtifactService
from services.desired_state_service import DesiredStateService
from services.enrollment_service import EnrollmentService
from services.handover_service import HandoverService
from services.job_service import JobService
from services.return_service import ReturnService
from services.rollout_service import RolloutService
from services.secret_service import SecretService
from workers.job_worker import JobWorker
from workers.observer import ControlPlaneObserver


@pytest.fixture
def settings() -> Settings:
    return Settings(salt_env="test", jwt_lab_secret="test-secret")


@pytest.fixture
def repos():
    return build_in_memory_repos()


@pytest.fixture(autouse=True)
async def seed_complete_bindings(repos):
    """Ring 0 and job tests require complete non-System bindings (v2.4.2 fail-closed)."""
    for i in range(1, 6):
        await repos.bindings.upsert(
            BindingRecord(
                endpoint_id=f"ep_{i}",
                user_id=f"u{i}",
                windows_account=rf"DOMAIN\user{i}",
                windows_sid=f"S-1-5-21-{i}",
                profile_dir=rf"C:\Users\user{i}",
                active=True,
                revision=f"b{i}",
                bound_at=datetime.now(UTC),
            )
        )
    return repos


@pytest.fixture
def backend() -> FakeManagementBackend:
    return FakeManagementBackend()


@pytest.fixture
def masters() -> list[FakeSaltMaster]:
    return [FakeSaltMaster(name="salt-a")]


@pytest.fixture
def secret_provider() -> FakeSecretProvider:
    return FakeSecretProvider()


@pytest.fixture
def artifact_store() -> FakeArtifactStore:
    return FakeArtifactStore()


@pytest.fixture
def app_state(settings, repos, backend, masters, secret_provider, artifact_store) -> AppState:
    idempotency = IdempotencyStore()
    job_service = JobService(repos)
    job_worker = JobWorker(
        masters=masters,
        repos=repos,
        artifact_store=artifact_store,
        settings=settings,
    )
    observer = ControlPlaneObserver(masters=masters, repos=repos)
    return AppState(
        settings=settings,
        repos=repos,
        idempotency=idempotency,
        backend=backend,
        masters=masters,
        secret_provider=secret_provider,
        artifact_store=artifact_store,
        enrollment_service=EnrollmentService(repos, settings, masters),
        desired_state_service=DesiredStateService(repos, backend, settings),
        return_service=ReturnService(repos),
        secret_service=SecretService(repos, secret_provider),
        artifact_service=ArtifactService(repos, artifact_store),
        rollout_service=RolloutService(repos),
        job_service=job_service,
        handover_service=HandoverService(job_service),
        job_worker=job_worker,
        observer=observer,
    )


@pytest.fixture
def client(app_state: AppState) -> TestClient:
    app = create_app(state=app_state)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def seed_token(repos):
    async def _seed(token: str = "one-time-token", *, expired: bool = False, used: bool = False) -> str:
        expires = datetime.now(UTC) + (timedelta(hours=-1) if expired else timedelta(hours=1))
        await repos.pending_tokens.put(
            PendingTokenRecord(
                token_hash=hash_secret(token),
                tenant_id="tenant_test",
                expires_at=expires,
                used=used,
            )
        )
        return token

    return _seed


@pytest.fixture
def master_auth_header(settings: Settings) -> dict[str, str]:
    token = mint_lab_jwt(
        subject="salt-master",
        scopes=[Scope.DESIRED_STATE_READ, Scope.MASTER, Scope.ARTIFACT_READ],
        settings=settings,
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def operator_auth_header(settings: Settings) -> dict[str, str]:
    token = mint_lab_jwt(subject="ops", scopes=[Scope.ROLLOUT_ADMIN], settings=settings)
    return {"Authorization": f"Bearer {token}"}


def master_token(settings: Settings) -> str:
    return mint_lab_jwt(
        subject="salt-master",
        scopes=[Scope.DESIRED_STATE_READ, Scope.MASTER, Scope.ARTIFACT_READ],
        settings=settings,
    )


def operator_token(settings: Settings) -> str:
    return mint_lab_jwt(subject="ops", scopes=[Scope.ROLLOUT_ADMIN], settings=settings)
