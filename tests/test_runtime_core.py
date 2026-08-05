from __future__ import annotations

import asyncio
import zipfile
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app import create_app
from core.config import Settings
from core.lifecycle import lifespan
from db.session import create_engine, init_db
from runtime.checksum_verifier import sha256_file
from runtime.executable_policy import ExecutablePolicy
from runtime.platform_paths import RuntimeLayout, default_runtime_data_dir
from services.runtime_job_service import RuntimeJobService


@pytest.mark.asyncio
async def test_runtime_status_and_capabilities(app_client) -> None:
    client, *_ = app_client
    status = await client.get("/api/v1/runtime/status")
    assert status.status_code == 200
    body = status.json()
    assert body["status"] == "ready"
    assert "features" in body
    assert body["apiVersion"] == "1.0"

    caps = await client.get("/api/v1/runtime/capabilities")
    assert caps.status_code == 200
    assert "runtime.install" in caps.json()["features"]


@pytest.mark.asyncio
async def test_runtime_job_create_and_complete(app_client) -> None:
    client, *_ = app_client
    resp = await client.post("/api/v1/runtime/jobs", json={"jobType": "doctor", "request": {}})
    assert resp.status_code == 200
    job_id = resp.json()["jobId"]

    # wait for worker
    for _ in range(50):
        detail = await client.get(f"/api/v1/runtime/jobs/{job_id}")
        assert detail.status_code == 200
        if detail.json()["status"] in ("succeeded", "failed", "cancelled"):
            break
        await asyncio.sleep(0.1)
    assert detail.json()["status"] == "succeeded"


@pytest.mark.asyncio
async def test_runtime_write_job_lock(app_client, test_settings: Settings) -> None:
    client, supervisor, settings, stub_hub, app = app_client
    jobs: RuntimeJobService = app.state.runtime_job_service

    async def slow_handler(job, request, progress):
        await asyncio.sleep(0.5)
        await progress("slow", progress_value=1.0)
        return {"ok": True}

    jobs.register_handler("install", slow_handler)
    first = await client.post("/api/v1/runtime/install", json={"version": "0.1.0"})
    assert first.status_code == 200
    second = await client.post("/api/v1/runtime/install", json={"version": "0.1.1"})
    assert second.status_code == 409
    err = second.json()["error"]
    assert err["code"] == "runtime_lock_conflict"


def test_platform_paths_layout(tmp_path: Path) -> None:
    layout = RuntimeLayout.from_root(tmp_path / "rt")
    layout.ensure()
    assert layout.versions.exists()
    assert layout.staging.exists()
    assert layout.active_json.parent.exists()


def test_default_runtime_data_dir() -> None:
    path = default_runtime_data_dir()
    assert "HermesRuntime" in str(path) or ".hermes-runtime" in str(path)
    import sys

    if sys.platform == "win32":
        assert "HermesRuntime" in str(path)
        assert "AppData" in str(path) or "LOCALAPPDATA" in str(path).upper()


def test_windows_programs_root_helpers() -> None:
    import sys

    from runtime.windows_program_paths import (
        DEFAULT_HERMES_INSTALL_DIR,
        default_hermes_install_dir,
        is_under_programs_root,
    )

    assert is_under_programs_root(Path(r"D:\Programs\HermesAgent"))
    assert is_under_programs_root(Path(r"D:\Programs\copilot-serve\.venv"))
    assert not is_under_programs_root(Path(r"C:\Temp\HermesAgent"))
    if sys.platform == "win32":
        assert default_hermes_install_dir() == DEFAULT_HERMES_INSTALL_DIR
        settings = Settings(hermes_install_dir="")
        assert settings.resolved_hermes_install_dir() == DEFAULT_HERMES_INSTALL_DIR
        assert settings.resolved_toolchain_venv_dir() is None
    else:
        assert default_hermes_install_dir() is None


def test_executable_policy_blocks_shell() -> None:
    policy = ExecutablePolicy()
    with pytest.raises(Exception) as exc:
        policy.validate_command("cmd.exe", ["/c", "echo hi"])
    assert "policy_denied" in str(exc.value.code) or "Forbidden" in str(exc.value)


def test_executable_policy_allows_binary() -> None:
    ExecutablePolicy().validate_command("markitdown-mcp", [])


@pytest.mark.asyncio
async def test_pairing_flow(app_client) -> None:
    client, *_ = app_client
    start = await client.post("/api/v1/pairings/start")
    assert start.status_code == 200
    pairing_id = start.json()["pairingId"]
    challenge = start.json()["challenge"]
    confirm = await client.post(
        f"/api/v1/pairings/{pairing_id}/confirm",
        json={"challenge": challenge, "deviceName": "test-desktop"},
    )
    assert confirm.status_code == 200
    assert "deviceToken" in confirm.json()
    devices = await client.get("/api/v1/devices")
    assert devices.status_code == 200
    assert len(devices.json()) >= 1


@pytest.mark.asyncio
async def test_instances_crud(app_client) -> None:
    client, *_ = app_client
    created = await client.post(
        "/api/v1/instances",
        json={"name": "coding", "profileName": "coding", "autoStart": False},
    )
    assert created.status_code == 200
    body = created.json()
    assert body["name"] == "coding"
    assert body["gatewayPort"] > 0
    listed = await client.get("/api/v1/instances")
    assert listed.status_code == 200
    assert any(i["id"] == body["id"] for i in listed.json())


@pytest.mark.asyncio
async def test_secrets_do_not_return_value(app_client) -> None:
    client, *_ = app_client
    put = await client.put("/api/v1/secrets/default/DASHSCOPE_API_KEY", json={"value": "sk-secret"})
    assert put.status_code == 200
    assert put.json()["configured"] is True
    assert "value" not in put.json()
    listed = await client.get("/api/v1/secrets/default")
    assert listed.status_code == 200
    assert listed.json()[0]["name"] == "DASHSCOPE_API_KEY"
    assert "value" not in listed.json()[0]


@pytest.mark.asyncio
async def test_mcp_rejects_shell_command(app_client) -> None:
    client, *_ = app_client
    inst = await client.post("/api/v1/instances", json={"name": "mcp-test"})
    instance_id = inst.json()["id"]
    bad = await client.post(
        f"/api/v1/instances/{instance_id}/mcp/servers",
        json={"name": "evil", "transport": "stdio", "command": "powershell", "args": ["-Command", "dir"]},
    )
    assert bad.status_code in (400, 403)


@pytest.mark.asyncio
async def test_mcp_crud(app_client) -> None:
    client, *_ = app_client
    inst = await client.post("/api/v1/instances", json={"name": "mcp-ok"})
    instance_id = inst.json()["id"]
    created = await client.post(
        f"/api/v1/instances/{instance_id}/mcp/servers",
        json={"name": "markitdown", "transport": "stdio", "command": "markitdown-mcp", "args": []},
    )
    assert created.status_code == 200
    server_id = created.json()["id"]
    listed = await client.get(f"/api/v1/instances/{instance_id}/mcp/servers")
    assert any(s["id"] == server_id for s in listed.json())


@pytest.mark.asyncio
async def test_configuration_patch_snapshot(app_client, test_settings: Settings) -> None:
    client, *_ = app_client
    inst = await client.post("/api/v1/instances", json={"name": "cfg"})
    instance_id = inst.json()["id"]
    profile_dir = test_settings.hermes_home_path / "profiles" / "cfg"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "config.yaml").write_text("model:\n  id: a\n", encoding="utf-8")
    patched = await client.patch(
        f"/api/v1/instances/{instance_id}/configuration",
        json={"group": "model", "values": {"id": "b"}},
    )
    assert patched.status_code == 200
    assert patched.json()["configuration"]["model"]["id"] == "b"


@pytest.mark.asyncio
async def test_backup_create_list(app_client, test_settings: Settings) -> None:
    client, *_ = app_client
    test_settings.hermes_home_path.mkdir(parents=True, exist_ok=True)
    (test_settings.hermes_home_path / "config.yaml").write_text("x: 1\n", encoding="utf-8")
    created = await client.post("/api/v1/runtime/backups", json={})
    assert created.status_code == 200
    backup_id = created.json()["backupId"]
    listed = await client.get("/api/v1/runtime/backups")
    assert any(b["backupId"] == backup_id for b in listed.json())


@pytest.mark.asyncio
async def test_install_job_rejects_non_installable_artifact(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """v1.3.1: non-installable artifact must fail the job (no stub activation)."""
    import json
    import sys

    runtime_data = tmp_path / "rt"
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir()
    db_path = tmp_path / "db.sqlite"
    artifact_dir = tmp_path / "artifact"
    artifact_dir.mkdir()
    (artifact_dir / "README.md").write_text("not installable\n", encoding="utf-8")
    zip_path = tmp_path / "hermes-0.19.0.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.write(artifact_dir / "README.md", arcname="README.md")
    checksum = sha256_file(zip_path)
    platform = "windows" if sys.platform == "win32" else ("macos" if sys.platform == "darwin" else "linux")
    manifest = {
        "version": "0.19.0",
        "channel": "stable",
        "platform": platform,
        "architecture": "x86_64",
        "artifactType": "wheel-bundle",
        "url": zip_path.as_uri(),
        "sha256": checksum,
    }
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    monkeypatch.setenv("SQLITE_PATH", str(db_path))
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))
    monkeypatch.setenv("RUNTIME_DATA_DIR", str(runtime_data))
    monkeypatch.setenv("LOG_DIR", str(tmp_path / "logs"))
    monkeypatch.setenv("HERMES_MANIFEST_URL", manifest_path.as_uri())
    monkeypatch.setenv("RUNTIME_REQUIRE_AUTH", "false")
    monkeypatch.setenv("DEFAULT_GATEWAY_PORT", "18755")
    import core.config as config_mod

    config_mod._settings = None
    from core.config import get_settings

    settings = get_settings()
    engine = create_engine(settings)
    await init_db(engine)

    app = create_app()
    app.state._test_engine = engine
    app.state._disable_workers = True
    app.state._disable_gateway_autostart = True

    async with lifespan(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/runtime/install",
                json={"version": "0.19.0", "channel": "stable", "createDefaultInstance": True},
            )
            assert resp.status_code == 200
            job_id = resp.json()["jobId"]
            final = None
            for _ in range(100):
                detail = await client.get(f"/api/v1/runtime/jobs/{job_id}")
                final = detail.json()
                if final["status"] in ("succeeded", "failed", "cancelled"):
                    break
                await asyncio.sleep(0.1)
            assert final is not None
            assert final["status"] == "failed", final
            err = final.get("errorCode") or final.get("error_code") or ""
            assert "artifact_not_installable" in str(err) or "artifact_not_installable" in str(final)

    config_mod._settings = None
