from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import RuntimeServiceVersion
from runtime.artifact_downloader import ArtifactDownloader
from runtime.artifact_signature import ArtifactSignatureVerifier
from runtime.archive_policy import ArchivePolicy
from runtime.checksum_verifier import ChecksumVerifier
from runtime.platform_paths import RuntimeLayout
from version import __version__


def _parse_public_keys(settings: Settings) -> dict[str, str]:
    raw = (settings.runtime_manifest_public_keys_json or "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return {str(k): str(v) for k, v in data.items()}
    except json.JSONDecodeError:
        pass
    return {}


# @lat: [[runtime-service#Runtime Service 更新]]
class RuntimeServiceUpdateService:
    """Check/download/apply for Runtime Service self-update (FR-22). Apply is maintenance-process oriented."""

    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._session = session
        self._layout = RuntimeLayout.from_root(settings.resolved_runtime_data_dir())
        self._layout.ensure()
        self._policy = ArchivePolicy(settings)
        self._downloader = ArtifactDownloader(settings=settings)
        self._checksum = ChecksumVerifier()
        self._verifier = ArtifactSignatureVerifier(_parse_public_keys(settings))

    async def check(self, *, channel: str = "stable") -> dict[str, Any]:
        current = __version__
        latest = await self._fetch_latest_release(channel)
        update_available = bool(latest and latest.get("version") and latest["version"] != current)
        return {
            "currentVersion": current,
            "latestVersion": latest.get("version") if latest else None,
            "channel": channel,
            "updateAvailable": update_available,
            "release": latest,
        }

    async def download(self, *, version: str | None = None, channel: str = "stable") -> dict[str, Any]:
        release = await self._fetch_release(version, channel)
        resolved_version = str(release.get("version") or version or "")
        if not resolved_version:
            raise RuntimeServiceError("Release missing version", code="manifest_invalid")

        manifest_envelope = release if "payload" in release else {"payload": release}
        payload = self._verifier.verify(manifest_envelope)
        url = str(payload.get("url") or release.get("url") or "")
        expected_sha = str(payload.get("sha256") or release.get("sha256") or "")
        if not url:
            raise RuntimeServiceError("Release missing download url", code="manifest_invalid")

        self._policy.validate_url(url)
        dest = self._policy.cache_path(url, self._layout.downloads)
        if dest.exists() and expected_sha and self._checksum.verify_file(dest, expected_sha):
            row = await self._upsert_version(resolved_version, channel, url, expected_sha, str(dest), payload)
            await self._session.commit()
            return {"version": resolved_version, "path": str(dest), "status": row.status, "cached": True}

        await self._downloader.download(url, dest)
        if expected_sha and not self._checksum.verify_file(dest, expected_sha):
            dest.unlink(missing_ok=True)
            raise RuntimeServiceError("Runtime service artifact checksum mismatch", code="checksum_mismatch")

        row = await self._upsert_version(resolved_version, channel, url, expected_sha, str(dest), payload)
        row.downloaded_at = datetime.now(UTC)
        row.status = "downloaded"
        await self._session.commit()
        return {"version": resolved_version, "path": str(dest), "status": row.status, "cached": False}

    async def apply(self, *, version: str | None = None, dry_run: bool = False) -> dict[str, Any]:
        """Maintenance flow: verify → stop daemon → backup DB → replace → alembic → start → health → rollback on failure."""
        target_version = version or (await self.check()).get("latestVersion")
        if not target_version:
            raise RuntimeServiceError("No target version to apply", code="not_found")

        result = await self._session.execute(
            select(RuntimeServiceVersion).where(RuntimeServiceVersion.version == target_version)
        )
        row = result.scalar_one_or_none()
        if row is None or not row.artifact_path:
            raise RuntimeServiceError(
                f"Runtime service {target_version} not downloaded",
                code="not_found",
            )
        artifact = Path(row.artifact_path)
        if not artifact.exists():
            raise RuntimeServiceError("Downloaded artifact missing on disk", code="not_found")

        steps: list[dict[str, Any]] = []

        def _step(name: str, status: str, detail: str | None = None) -> None:
            steps.append({"step": name, "status": status, "detail": detail})

        _step("verify", "ok", f"artifact={artifact.name}")
        if expected := row.checksum:
            if not self._checksum.verify_file(artifact, expected):
                _step("verify", "failed", "checksum mismatch")
                raise RuntimeServiceError("Artifact checksum mismatch", code="checksum_mismatch")

        if dry_run:
            for name in ("stop_daemon", "backup_db", "replace", "alembic", "start", "health"):
                _step(name, "skipped", "dry_run")
            return {"version": target_version, "dryRun": True, "steps": steps}

        _step("stop_daemon", "stub", "Maintenance process would stop UserDaemon")
        _step("backup_db", "stub", f"Would backup {self._layout.db_path}")
        _step("replace", "stub", f"Would replace service bundle from {artifact}")
        _step("alembic", "stub", "Would run alembic upgrade head")
        _step("start", "stub", "Would start UserDaemon")
        _step("health", "stub", "Would poll /health until ready")

        row.status = "applied"
        row.applied_at = datetime.now(UTC)
        await self._session.commit()
        return {
            "version": target_version,
            "applied": False,
            "maintenanceRequired": True,
            "steps": steps,
            "note": "Apply orchestration is stubbed; invoke maintenance executable for real replace/restart.",
        }

    async def _fetch_latest_release(self, channel: str) -> dict[str, Any] | None:
        url = (self._settings.runtime_service_manifest_url or "").strip()
        if not url:
            return None
        data = await self._downloader.fetch_json(url)
        if "payload" in data:
            return self._verifier.verify(data)
        if "releases" in data and isinstance(data["releases"], list):
            candidates = [
                r for r in data["releases"] if isinstance(r, dict) and str(r.get("channel", channel)) == channel
            ]
            if not candidates:
                return None
            from services.installation_service import _semver_key

            candidates.sort(key=lambda r: _semver_key(str(r.get("version") or "0")), reverse=True)
            item = candidates[0]
            if "payload" in item:
                return self._verifier.verify(item)
            return item
        return data if isinstance(data, dict) else None

    async def _fetch_release(self, version: str | None, channel: str) -> dict[str, Any]:
        latest = await self._fetch_latest_release(channel)
        if latest is None:
            raise RuntimeServiceError(
                "RUNTIME_SERVICE_MANIFEST_URL is not configured",
                code="manifest_invalid",
            )
        if version and str(latest.get("version")) != version:
            url = (self._settings.runtime_service_manifest_url or "").strip()
            data = await self._downloader.fetch_json(url)
            if "releases" in data:
                for item in data["releases"]:
                    if isinstance(item, dict) and str(item.get("version")) == version:
                        if "payload" in item:
                            return self._verifier.verify(item)
                        return item
            raise RuntimeServiceError(f"Version not found: {version}", code="manifest_invalid")
        return latest

    async def _upsert_version(
        self,
        version: str,
        channel: str,
        url: str,
        checksum: str,
        path: str,
        payload: dict[str, Any],
    ) -> RuntimeServiceVersion:
        result = await self._session.execute(
            select(RuntimeServiceVersion).where(RuntimeServiceVersion.version == version)
        )
        row = result.scalar_one_or_none()
        key_id = payload.get("keyId") or payload.get("key_id")
        if row is None:
            row = RuntimeServiceVersion(
                version=version,
                channel=channel,
                download_url=url,
                checksum=checksum or None,
                signature_key_id=str(key_id) if key_id else None,
                artifact_path=path,
                status="downloaded",
                metadata_json=json.dumps({"channel": channel}),
            )
            self._session.add(row)
        else:
            row.download_url = url
            row.checksum = checksum or None
            row.signature_key_id = str(key_id) if key_id else None
            row.artifact_path = path
            row.status = "downloaded"
        await self._session.flush()
        return row
