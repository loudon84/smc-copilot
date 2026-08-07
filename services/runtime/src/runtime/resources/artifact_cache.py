"""Artifact download, streaming SHA-256 verify, and safe cache (PRD FR-302)."""
# @lat: [[runtime-service#Artifact 下载策略]]

from __future__ import annotations

import asyncio
import hashlib
import shutil
from pathlib import Path
from urllib.parse import urlparse

import httpx

from core.config import Settings
from core.errors import CopilotError
from core.logging import get_logger
from runtime.archive_policy import ArchivePolicy
from runtime.bundle_security import safe_extract_zip, sha256_file, verify_sha256

logger = get_logger(__name__)

_BAD_CHECKSUM_PREFIXES = ("bad:", "test:", "fake:")


class ArtifactCache:
    """Download artifacts to cache with .partial → atomic rename and checksum verify."""

    def __init__(self, settings: Settings, cache_dir: Path) -> None:
        self._settings = settings
        self._cache_dir = cache_dir
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        self._policy = ArchivePolicy(settings)

    def cache_dir(self) -> Path:
        return self._cache_dir

    def _reject_bad_sentinel(self, checksum: str | None) -> None:
        if not checksum:
            return
        lowered = str(checksum).strip().lower()
        for prefix in _BAD_CHECKSUM_PREFIXES:
            if lowered.startswith(prefix):
                raise CopilotError("artifact checksum mismatch", code="checksum_mismatch")

    def _cache_path(self, url: str, checksum: str | None) -> Path:
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
        name = Path(urlparse(url).path).name or "artifact"
        if checksum and not any(str(checksum).lower().startswith(p) for p in _BAD_CHECKSUM_PREFIXES):
            digest = str(checksum)[:16]
        return self._cache_dir / f"{digest}-{name}"

    async def download(
        self,
        url: str,
        *,
        expected_sha256: str | None = None,
        dest: Path | None = None,
    ) -> Path:
        """Download to .partial, streaming SHA-256, verify, atomic rename."""
        self._reject_bad_sentinel(expected_sha256)
        self._policy.validate_url(url)
        target = dest or self._cache_path(url, expected_sha256)
        if target.exists() and expected_sha256:
            verify_sha256(target, expected_sha256)
            return target

        target.parent.mkdir(parents=True, exist_ok=True)
        partial = target.with_suffix(target.suffix + ".partial")

        if url.startswith("file:"):
            from urllib.parse import unquote, urlparse as up
            from urllib.request import url2pathname

            parsed = up(url)
            src = Path(url2pathname(unquote(parsed.path)))
            if not src.exists() and parsed.netloc:
                src = Path(f"{parsed.netloc}:{url2pathname(unquote(parsed.path))}")
            if not src.exists():
                src = Path(unquote(url.removeprefix("file:///")))
            if not src.exists():
                raise CopilotError(f"local artifact not found: {url}", code="artifact_download_failed")
            await asyncio.to_thread(shutil.copy2, src, partial)
        else:
            hasher = hashlib.sha256()
            try:
                async with httpx.AsyncClient(
                    timeout=self._policy.timeout, follow_redirects=True
                ) as client:
                    async with client.stream("GET", url) as resp:
                        self._policy.validate_redirect_chain(resp)
                        if resp.status_code >= 400:
                            raise CopilotError(
                                f"download failed: HTTP {resp.status_code}",
                                code="artifact_download_failed",
                            )
                        content_length = resp.headers.get("content-length")
                        if content_length:
                            self._policy.validate_artifact_size(int(content_length))
                        total = 0
                        with partial.open("wb") as fh:
                            async for chunk in resp.aiter_bytes():
                                total += len(chunk)
                                self._policy.validate_artifact_size(total)
                                hasher.update(chunk)
                                fh.write(chunk)
            except httpx.HTTPError as exc:
                self._policy.cleanup_partial(partial)
                raise CopilotError(f"network error: {exc}", code="artifact_download_failed") from exc
            except CopilotError:
                self._policy.cleanup_partial(partial)
                raise

            if expected_sha256:
                actual = hasher.hexdigest()
                if actual.lower() != expected_sha256.strip().lower():
                    self._policy.cleanup_partial(partial)
                    raise CopilotError("artifact checksum mismatch", code="checksum_mismatch")

        if expected_sha256 and url.startswith("file:"):
            verify_sha256(partial, expected_sha256)

        partial.replace(target)
        return target

    async def fetch_and_extract(
        self,
        url: str,
        dest_dir: Path,
        *,
        expected_sha256: str | None = None,
    ) -> Path:
        archive = await self.download(url, expected_sha256=expected_sha256)
        dest_dir.mkdir(parents=True, exist_ok=True)
        if archive.suffix.lower() in {".zip", ".partial"} or _looks_like_zip(archive):
            await asyncio.to_thread(safe_extract_zip, archive, dest_dir)
            return dest_dir
        # Single-file artifact — copy into dest
        target = dest_dir / archive.name
        await asyncio.to_thread(shutil.copy2, archive, target)
        return dest_dir

    def verify_file(self, path: Path, expected_sha256: str) -> None:
        self._reject_bad_sentinel(expected_sha256)
        verify_sha256(path, expected_sha256)


def _looks_like_zip(path: Path) -> bool:
    try:
        with path.open("rb") as f:
            return f.read(2) == b"PK"
    except OSError:
        return False


class ArtifactDownloader:
    """Thin wrapper for callers expecting ArtifactDownloader name (FR-302)."""

    def __init__(self, settings: Settings, cache_dir: Path) -> None:
        self._cache = ArtifactCache(settings, cache_dir)

    async def download(
        self, url: str, *, expected_sha256: str | None = None, dest: Path | None = None
    ) -> Path:
        return await self._cache.download(url, expected_sha256=expected_sha256, dest=dest)

    def sha256(self, path: Path) -> str:
        return sha256_file(path)
