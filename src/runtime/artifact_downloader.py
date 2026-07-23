from __future__ import annotations

import asyncio
import shutil
from pathlib import Path

import httpx

from core.logging import get_logger
from core.runtime_errors import RuntimeServiceError

logger = get_logger(__name__)


class ArtifactDownloader:
    def __init__(self, *, timeout: float = 300.0) -> None:
        self._timeout = timeout

    async def download(self, url: str, dest: Path) -> Path:
        dest.parent.mkdir(parents=True, exist_ok=True)
        if url.startswith("file:"):
            from urllib.parse import urlparse, unquote
            from urllib.request import url2pathname

            parsed = urlparse(url)
            src = Path(url2pathname(unquote(parsed.path)))
            # Windows file:///C:/... -> path may need adjustment
            if not src.exists() and parsed.netloc:
                src = Path(f"{parsed.netloc}:{url2pathname(unquote(parsed.path))}")
            if not src.exists():
                # fallback: Path from URI
                try:
                    src = Path(unquote(url.removeprefix("file:///")))
                    if not src.exists():
                        src = Path(unquote(url.removeprefix("file://")))
                except Exception:
                    pass
            if not src.exists():
                raise RuntimeServiceError(
                    f"Local artifact not found: {url}",
                    code="artifact_download_failed",
                    details={"url": url},
                )
            import shutil

            await asyncio.to_thread(shutil.copy2, src, dest)
            return dest

        tmp = dest.with_suffix(dest.suffix + ".partial")
        try:
            async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
                async with client.stream("GET", url) as resp:
                    if resp.status_code >= 400:
                        raise RuntimeServiceError(
                            f"Download failed: HTTP {resp.status_code}",
                            code="artifact_download_failed",
                            details={"url": url, "status": resp.status_code},
                        )
                    with tmp.open("wb") as fh:
                        async for chunk in resp.aiter_bytes():
                            fh.write(chunk)
            tmp.replace(dest)
            return dest
        except RuntimeServiceError:
            if tmp.exists():
                tmp.unlink(missing_ok=True)
            raise
        except httpx.HTTPError as exc:
            if tmp.exists():
                tmp.unlink(missing_ok=True)
            raise RuntimeServiceError(
                f"Network error downloading artifact: {exc}",
                code="artifact_download_failed",
                details={"url": url},
            ) from exc

    async def fetch_json(self, url: str) -> dict:
        if url.startswith("file:"):
            from urllib.parse import urlparse, unquote
            from urllib.request import url2pathname
            import json

            parsed = urlparse(url)
            src = Path(url2pathname(unquote(parsed.path)))
            if not src.exists() and parsed.netloc:
                src = Path(f"{parsed.netloc}:{url2pathname(unquote(parsed.path))}")
            if not src.exists():
                try:
                    src = Path(unquote(url.removeprefix("file:///")))
                    if not src.exists():
                        src = Path(unquote(url.removeprefix("file://")))
                except Exception:
                    pass
            if not src.exists():
                raise RuntimeServiceError(f"Manifest file not found: {url}", code="manifest_invalid")
            data = json.loads(src.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                raise RuntimeServiceError("Manifest is not an object", code="manifest_invalid")
            return data
        try:
            async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
                resp = await client.get(url)
                if resp.status_code >= 400:
                    raise RuntimeServiceError(
                        f"Manifest fetch failed: HTTP {resp.status_code}",
                        code="manifest_invalid",
                        details={"url": url},
                    )
                data = resp.json()
                if not isinstance(data, dict):
                    raise RuntimeServiceError("Manifest is not an object", code="manifest_invalid")
                return data
        except RuntimeServiceError:
            raise
        except Exception as exc:
            raise RuntimeServiceError(
                f"Failed to fetch manifest: {exc}",
                code="network_unavailable",
                details={"url": url},
            ) from exc

    def extract_archive(self, archive: Path, dest_dir: Path) -> Path:
        dest_dir.mkdir(parents=True, exist_ok=True)
        try:
            shutil.unpack_archive(str(archive), str(dest_dir))
        except Exception as exc:
            raise RuntimeServiceError(
                f"Failed to extract artifact: {exc}",
                code="hermes_install_failed",
            ) from exc
        return dest_dir

    async def extract_archive_async(self, archive: Path, dest_dir: Path) -> Path:
        return await asyncio.to_thread(self.extract_archive, archive, dest_dir)
