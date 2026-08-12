from __future__ import annotations

import httpx

from integrations.artifact_store import ArtifactMeta, ArtifactStore


class HttpArtifactStore:
    def __init__(self, base_url: str, *, token: str = "", timeout: float = 10.0) -> None:
        if not base_url.startswith("https://"):
            raise ValueError("artifact store URL must be https")
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    async def get_manifest(
        self, component: str, version: str, *, platform: str = "windows", arch: str = "AMD64"
    ) -> ArtifactMeta | None:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(
                f"{self.base_url}/artifacts/{component}/{version}",
                params={"platform": platform, "arch": arch},
                headers=self._headers(),
            )
        if resp.status_code == 404:
            return None
        if resp.status_code >= 400:
            raise RuntimeError("artifact store error")
        data = resp.json()
        # Ed25519 metadata required
        for required in ("sha256", "manifestSignature", "keyId", "url", "size"):
            snake = {
                "manifestSignature": "manifest_signature",
                "keyId": "key_id",
                "rollbackVersion": "rollback_version",
            }.get(required, required)
            if required not in data and snake not in data:
                raise RuntimeError(f"artifact metadata missing {required}")
        return ArtifactMeta(
            component=str(data.get("component", component)),
            version=str(data.get("version", version)),
            platform=str(data.get("platform", platform)),
            arch=str(data.get("arch", arch)),
            size=int(data.get("size")),
            sha256=str(data.get("sha256")),
            url=str(data.get("url")),
            manifest_signature=str(data.get("manifestSignature") or data.get("manifest_signature")),
            key_id=str(data.get("keyId") or data.get("key_id")),
            rollback_version=(data.get("rollbackVersion") or data.get("rollback_version")),
        )

    async def ready(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(f"{self.base_url}/health", headers=self._headers())
            return resp.status_code < 500
        except Exception:
            return False


_: type[ArtifactStore] = HttpArtifactStore  # type: ignore[misc, assignment]
