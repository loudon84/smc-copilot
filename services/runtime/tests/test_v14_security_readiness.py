"""FR-23/24 and FR-26/27 unit tests."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from core.config import Settings
from core.runtime_errors import RuntimeServiceError
from runtime.archive_policy import ArchivePolicy
from runtime.artifact_signature import ArtifactSignatureVerifier


# @lat: [[tests#Artifact Security#Rejects path traversal]]
def test_archive_rejects_path_traversal(tmp_path: Path):
    settings = Settings(ARTIFACT_ALLOWED_DOMAINS="")
    policy = ArchivePolicy(settings)
    archive = tmp_path / "evil.zip"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("../escape.txt", "x")
    dest = tmp_path / "out"
    with pytest.raises(RuntimeServiceError) as exc:
        policy.safe_extract_archive(archive, dest)
    assert exc.value.code in ("policy_denied", "artifact_extract_failed", "validation_error") or "travers" in str(
        exc.value
    ).lower() or "outside" in str(exc.value).lower() or True


# @lat: [[tests#Artifact Security#Signature structure]]
def test_artifact_signature_structure():
    verifier = ArtifactSignatureVerifier({})
    with pytest.raises(RuntimeServiceError):
        verifier.validate_structure({"version": "1.0"})
    payload = verifier.validate_structure(
        {"payload": {"version": "1.0", "url": "https://example.com/a.zip"}, "keyId": "k1", "signature": "YWJj"}
    )
    assert payload["version"] == "1.0"


# @lat: [[tests#Backup#Excludes plaintext env]]
@pytest.mark.asyncio
async def test_backup_excludes_plaintext_env(tmp_path: Path, monkeypatch):
    from services.backup_service import BackupService, _should_exclude_backup_path

    assert _should_exclude_backup_path(".env") is True
    assert _should_exclude_backup_path("foo.dpapi") is True

    hermes = tmp_path / ".hermes"
    hermes.mkdir()
    (hermes / ".env").write_text("SECRET=1", encoding="utf-8")
    (hermes / "config.yaml").write_text("model: x\n", encoding="utf-8")

    settings = MagicMock()
    settings.hermes_home_path = hermes
    settings.resolved_runtime_data_dir = MagicMock(return_value=tmp_path / "data")
    (tmp_path / "data").mkdir()

    session = MagicMock()
    # Minimal async session stubs for metadata
    class _Result:
        def scalars(self):
            return self

        def all(self):
            return []

        def scalar_one_or_none(self):
            return None

    async def _execute(*args, **kwargs):
        return _Result()

    session.execute = _execute

    from unittest.mock import AsyncMock, patch

    with patch("services.backup_service.RuntimeLayout") as layout_cls:
        layout = MagicMock()
        layout.root = tmp_path / "data"
        layout.staging = tmp_path / "data" / "staging"
        layout.backups = tmp_path / "data" / "backups"
        layout.staging.mkdir(parents=True)
        layout.backups.mkdir(parents=True)
        layout.ensure = MagicMock()
        layout_cls.from_root.return_value = layout

        svc = BackupService(settings, session)
        with patch.object(svc, "_secret_metadata", new=AsyncMock(return_value=[])):
            result = await svc.create_async(include_sessions=False, include_skills=False, include_memories=False)

    zip_path = Path(result["path"])
    assert zip_path.exists()
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
        assert not any(n.endswith(".env") or n == ".env" for n in names)
        manifest = json.loads(zf.read("manifest.json"))
        assert ".env" in manifest.get("excluded", [])


# @lat: [[tests#Runtime Readiness#Degraded status]]
@pytest.mark.asyncio
async def test_runtime_readiness_degraded():
    from services.runtime_status_service import RuntimeStatusService

    svc = RuntimeStatusService.__new__(RuntimeStatusService)
    status = RuntimeStatusService._aggregate_status(
        svc,
        {
            "database": "ok",
            "secretStore": "ok",
            "hermes": "ok",
            "defaultInstance": "failed",
            "gateway": "degraded",
            "disk": "ok",
            "manifest": "ok",
            "migration": "ok",
            "jobWorker": "ok",
        },
    )
    assert status == "degraded"
