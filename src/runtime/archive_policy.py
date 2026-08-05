from __future__ import annotations

import shutil
import zipfile
from pathlib import Path
from urllib.parse import urlparse

import httpx

from core.config import Settings
from core.runtime_errors import RuntimeServiceError


# @lat: [[runtime-service#Artifact 下载策略]]
class ArchivePolicy:
    """HTTPS, domain allowlist, size limits, redirect checks, and safe archive extraction (FR-24)."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        raw = (getattr(settings, "artifact_allowed_domains", "") or "").strip()
        self._allowed_domains = {d.strip().lower() for d in raw.split(",") if d.strip()}
        self._max_manifest_bytes = int(getattr(settings, "artifact_max_manifest_bytes", 1_048_576))
        self._max_artifact_bytes = int(getattr(settings, "artifact_max_artifact_bytes", 500_000_000))
        self._max_archive_files = int(getattr(settings, "artifact_max_archive_files", 10_000))
        self._max_archive_total_bytes = int(getattr(settings, "artifact_max_archive_total_bytes", 1_000_000_000))
        self._timeout = float(getattr(settings, "hermes_install_timeout_seconds", 900))

    @property
    def timeout(self) -> float:
        return self._timeout

    def validate_url(self, url: str, *, allow_file: bool = True) -> None:
        if url.startswith("file:"):
            if not allow_file:
                raise RuntimeServiceError("file:// URLs are not allowed", code="policy_denied")
            return
        parsed = urlparse(url)
        if parsed.scheme != "https":
            raise RuntimeServiceError("Artifact URL must use HTTPS", code="policy_denied", details={"url": url})
        host = (parsed.hostname or "").lower()
        if self._allowed_domains and host not in self._allowed_domains:
            raise RuntimeServiceError(
                f"Artifact domain not allowed: {host}",
                code="policy_denied",
                details={"host": host},
            )

    def validate_redirect_chain(self, response: httpx.Response) -> None:
        for resp in response.history:
            loc = resp.headers.get("location")
            if loc:
                self.validate_url(str(resp.url if resp.url else loc), allow_file=False)
        self.validate_url(str(response.url), allow_file=False)

    def validate_manifest_size(self, size: int) -> None:
        if size > self._max_manifest_bytes:
            raise RuntimeServiceError("Manifest exceeds maximum size", code="policy_denied")

    def validate_artifact_size(self, size: int) -> None:
        if size > self._max_artifact_bytes:
            raise RuntimeServiceError("Artifact exceeds maximum download size", code="policy_denied")

    def cache_path(self, url: str, layout_downloads: Path) -> Path:
        """Return stable cache path under downloads/ for a URL."""
        import hashlib

        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
        name = Path(urlparse(url).path).name or "artifact"
        return layout_downloads / f"{digest}-{name}"

    def cleanup_partial(self, path: Path) -> None:
        if path.exists() and path.suffix == ".partial":
            path.unlink(missing_ok=True)

    def safe_extract_archive(self, archive: Path, dest_dir: Path) -> Path:
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_resolved = dest_dir.resolve()
        file_count = 0
        total_bytes = 0

        if zipfile.is_zipfile(archive):
            with zipfile.ZipFile(archive) as zf:
                for info in zf.infolist():
                    if info.is_dir():
                        continue
                    file_count += 1
                    if file_count > self._max_archive_files:
                        raise RuntimeServiceError(
                            "Archive exceeds maximum file count",
                            code="policy_denied",
                        )
                    member = info.filename.replace("\\", "/")
                    if member.startswith("/") or ".." in member.split("/"):
                        raise RuntimeServiceError(
                            f"Archive path traversal rejected: {member}",
                            code="policy_denied",
                        )
                    target = (dest_dir / member).resolve()
                    if dest_resolved not in target.parents and target != dest_resolved:
                        raise RuntimeServiceError(
                            f"Archive path traversal rejected: {member}",
                            code="policy_denied",
                        )
                    total_bytes += info.file_size
                    if total_bytes > self._max_archive_total_bytes:
                        raise RuntimeServiceError(
                            "Archive exceeds maximum uncompressed size",
                            code="policy_denied",
                        )
                zf.extractall(dest_dir)
            return dest_dir

        # Fallback for tar/other formats: extract then scan
        try:
            shutil.unpack_archive(str(archive), str(dest_dir))
        except Exception as exc:
            raise RuntimeServiceError(
                f"Failed to extract artifact: {exc}",
                code="hermes_install_failed",
            ) from exc
        for path in dest_dir.rglob("*"):
            if path.is_file():
                file_count += 1
                if file_count > self._max_archive_files:
                    raise RuntimeServiceError("Archive exceeds maximum file count", code="policy_denied")
                rel = path.relative_to(dest_dir)
                if ".." in rel.parts:
                    raise RuntimeServiceError(
                        f"Archive path traversal rejected: {rel}",
                        code="policy_denied",
                    )
                total_bytes += path.stat().st_size
                if total_bytes > self._max_archive_total_bytes:
                    raise RuntimeServiceError(
                        "Archive exceeds maximum uncompressed size",
                        code="policy_denied",
                    )
        return dest_dir
