"""Real artifact install tests — stub success paths must fail (v1.3.1 FR-01/FR-02)."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest

from services.installation_service import InstallationService, _find_installable, _semver_key


def test_find_installable_rejects_readme_only(tmp_path: Path) -> None:
    (tmp_path / "README.md").write_text("no package\n", encoding="utf-8")
    from core.runtime_errors import RuntimeServiceError

    with pytest.raises(RuntimeServiceError) as exc:
        _find_installable(tmp_path)
    assert exc.value.code == "artifact_not_installable"


def test_find_installable_accepts_wheel(tmp_path: Path) -> None:
    wheel = tmp_path / "hermes_agent-0.19.0-py3-none-any.whl"
    wheel.write_bytes(b"PK\x05\x06" + b"\x00" * 18)
    kind, path = _find_installable(tmp_path)
    assert kind == "wheel"
    assert path == wheel


def test_find_installable_accepts_pyproject(tmp_path: Path) -> None:
    pkg = tmp_path / "src"
    pkg.mkdir()
    (pkg / "pyproject.toml").write_text("[project]\nname='hermes'\n", encoding="utf-8")
    kind, path = _find_installable(tmp_path)
    assert kind == "source"
    assert path == pkg


def test_semver_selects_highest() -> None:
    versions = ["0.18.0", "0.19.1", "0.19.0", "0.9.9"]
    versions.sort(key=_semver_key, reverse=True)
    assert versions[0] == "0.19.1"


@pytest.mark.asyncio
async def test_resolve_manifest_picks_highest_semver(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import core.config as config_mod

    releases = [
        {
            "version": "0.18.0",
            "channel": "stable",
            "platform": "windows",
            "architecture": "x86_64",
            "artifactType": "wheel-bundle",
            "url": "https://example/a.zip",
            "sha256": "a" * 64,
        },
        {
            "version": "0.19.0",
            "channel": "stable",
            "platform": "windows",
            "architecture": "x86_64",
            "artifactType": "wheel-bundle",
            "url": "https://example/b.zip",
            "sha256": "b" * 64,
        },
        {
            "version": "0.19.1",
            "channel": "stable",
            "platform": "windows",
            "architecture": "x86_64",
            "artifactType": "wheel-bundle",
            "url": "https://example/c.zip",
            "sha256": "c" * 64,
        },
    ]
    # Put highest version last to prove we do not use array order.
    ordered = [releases[1], releases[0], releases[2]]
    manifest = {"releases": ordered}
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    monkeypatch.setenv("HERMES_MANIFEST_URL", manifest_path.as_uri())
    monkeypatch.setenv("RUNTIME_DATA_DIR", str(tmp_path / "rt"))
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "db.sqlite"))
    config_mod._settings = None
    from core.config import get_settings
    from db.session import create_engine, create_sessionmaker

    settings = get_settings()
    engine = create_engine(settings)
    session_maker = create_sessionmaker(engine)
    svc = InstallationService(settings, session_maker)
    selected = await svc._resolve_manifest("latest", "stable", "windows", "x86_64")
    assert selected["version"] == "0.19.1"
    config_mod._settings = None


@pytest.mark.asyncio
async def test_install_fails_without_installable_artifact(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """v1.3.1: README-only zip must fail with artifact_not_installable — no stub."""
    import asyncio
    import sys

    from httpx import ASGITransport, AsyncClient

    from app import create_app
    from core.lifecycle import lifespan
    from db.session import create_engine, init_db
    from runtime.checksum_verifier import sha256_file as _sha

    runtime_data = tmp_path / "rt"
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir()
    db_path = tmp_path / "db.sqlite"
    artifact_dir = tmp_path / "artifact"
    artifact_dir.mkdir()
    (artifact_dir / "README.md").write_text("hermes stub\n", encoding="utf-8")
    zip_path = tmp_path / "hermes-0.19.0.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.write(artifact_dir / "README.md", arcname="README.md")
    checksum = _sha(zip_path)
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
            assert (
                final.get("errorCode") == "artifact_not_installable"
                or (final.get("error_code") == "artifact_not_installable")
                or "artifact_not_installable" in str(final)
            )

    config_mod._settings = None


def test_no_stub_writer_in_installation_service() -> None:
    import inspect

    import services.installation_service as mod

    source = inspect.getsource(mod)
    assert "_write_stub_hermes" not in source
    assert "0.0.0-stub" not in source
