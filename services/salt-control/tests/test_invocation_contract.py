from __future__ import annotations

import inspect
from pathlib import Path

import pytest
from pydantic import ValidationError

from core.config import Settings
from core.errors import SaltControlError
from db.repositories.interfaces import EndpointRecord
from integrations.artifact_store import ArtifactMeta
from schemas.job import JobCreateRequest
from schemas.job_payload import ConfigurePayload, InstallPayload, UpgradePayload
from services.artifact_invocation import ArtifactInvocation, resolve_artifact_invocation
from services.invocation import OPERATION_FUNCTIONS, build_invocation
from services.job_service import JobService

REPO = Path(__file__).resolve().parents[3]


def _load_execution_module(name: str):
    import importlib.util

    path = REPO / "infra" / "salt" / "extensions" / "_modules" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"exec_{name}", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _artifact() -> ArtifactInvocation:
    return ArtifactInvocation(
        version="0.20.0",
        artifact_url="https://artifacts.example/hermes.zip",
        artifact_sha256="ab" * 32,
        artifact_signature="sig",
        key_id="k1",
        public_key="pubkey",
        hermes_home=r"C:\Users\alice\AppData\Local\hermes",
    )


def test_invocation_kwargs_match_execution_signatures():
    hermes = _load_execution_module("smc_hermes")
    handover = _load_execution_module("smc_handover")
    artifact = _artifact()
    configure = ConfigurePayload(config={"platforms": {}}, hermes_home=r"C:\h", config_revision="note-1")
    samples = {
        "install": build_invocation("install", InstallPayload(version="0.20.0"), artifact=artifact),
        "upgrade": build_invocation("upgrade", UpgradePayload(version="0.20.0"), artifact=artifact),
        "configure": build_invocation("configure", configure),
        "start": build_invocation("start"),
        "stop": build_invocation("stop"),
        "restart": build_invocation("restart"),
        "health": build_invocation("health"),
        "diagnose": build_invocation("diagnose"),
        "rollback": build_invocation("rollback"),
        "handover": build_invocation("handover"),
        "remigrate": build_invocation("remigrate"),
    }
    modules = {"smc_hermes": hermes, "smc_handover": handover}
    for operation, invocation in samples.items():
        assert invocation.function == OPERATION_FUNCTIONS[operation]
        mod_name, func_name = invocation.function.split(".", 1)
        func = getattr(modules[mod_name], func_name)
        params = inspect.signature(func).parameters
        for key in invocation.kwarg:
            assert key in params, f"{operation} sends unknown kwarg {key}"
        assert "url" not in invocation.kwarg
        assert "sha256" not in invocation.kwarg
        assert "revision" not in invocation.kwarg
        assert "desired" not in invocation.kwarg


def test_install_uses_server_artifact_not_caller_url():
    artifact = _artifact()
    inv = build_invocation("install", InstallPayload(version="0.20.0"), artifact=artifact)
    assert inv.kwarg["artifact_url"] == artifact.artifact_url
    assert inv.kwarg["artifact_sha256"] == artifact.artifact_sha256
    assert inv.kwarg["public_key"] == "pubkey"
    with pytest.raises(ValidationError):
        InstallPayload(version="0.20.0", artifact_url="https://evil.example/h.zip")  # type: ignore[call-arg]


def test_configure_keeps_config_and_drops_legacy_keys():
    payload = ConfigurePayload(config={"a": 1}, hermes_home="H", config_revision="rev-note")
    inv = build_invocation("configure", payload)
    assert inv.kwarg == {"config": {"a": 1}, "hermes_home": "H", "note": "rev-note"}
    with pytest.raises(ValidationError):
        ConfigurePayload(config={"a": 1}, desired={"x": 1})  # type: ignore[call-arg]


@pytest.mark.asyncio
async def test_job_service_rejects_hostname_and_mismatched_ids(repos):
    service = JobService(repos)
    with pytest.raises(SaltControlError):
        await service.create(
            JobCreateRequest(
                endpoint_id="ep_one",
                minion_id="ITBJB0676",
                operation="health",
                idempotency_key="idem-mismatch",
                requested_by="ops",
            )
        )
    with pytest.raises(SaltControlError):
        await service.create(
            JobCreateRequest(
                endpoint_id="ITBJB0676",
                minion_id="ITBJB0676",
                operation="health",
                idempotency_key="idem-host",
                requested_by="ops",
            )
        )


@pytest.mark.asyncio
async def test_artifact_resolver_requires_trusted_key(repos, artifact_store):
    settings = Settings(
        salt_env="test", jwt_lab_secret="test-secret", artifact_key_id="k1", artifact_public_key="pubkey"
    )
    await repos.endpoints.create(
        EndpointRecord(
            id="ep_art",
            tenant_id="t",
            machine_guid_hash="h",
            hostname="PC",
            platform="windows",
            arch="AMD64",
            status="enrolled",
            device_credential_hash="x",
            created_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
        )
    )
    artifact_store.put(
        ArtifactMeta(
            component="hermes",
            version="0.20.0",
            platform="windows",
            arch="AMD64",
            size=1,
            sha256="ab" * 32,
            url="https://artifacts.example/h.zip",
            manifest_signature="sig",
            key_id="other",
        )
    )
    with pytest.raises(SaltControlError):
        await resolve_artifact_invocation(
            endpoint_id="ep_art",
            version="0.20.0",
            component="hermes",
            hermes_home=None,
            repos=repos,
            store=artifact_store,
            settings=settings,
        )
