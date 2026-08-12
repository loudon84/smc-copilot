from __future__ import annotations

import httpx

from integrations.secret_provider import SecretProvider


class HttpSecretProvider:
    """Resolves secrets via HTTPS; values must never enter logs/pillar/grains."""

    def __init__(self, base_url: str, *, token: str = "", timeout: float = 10.0) -> None:
        if not base_url.startswith("https://"):
            raise ValueError("secret provider URL must be https")
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    async def check_acl(self, ref: str, endpoint_id: str, user_id: str) -> bool:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/secrets/acl",
                headers=self._headers(),
                json={"ref": ref, "endpointId": endpoint_id, "userId": user_id},
            )
        if resp.status_code == 403:
            return False
        if resp.status_code >= 400:
            return False
        data = resp.json()
        return bool(data.get("allowed"))

    async def resolve(self, ref: str) -> str | None:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/secrets/resolve",
                headers=self._headers(),
                json={"ref": ref},
            )
        if resp.status_code == 404:
            return None
        if resp.status_code >= 400:
            return None
        data = resp.json()
        value = data.get("value")
        return str(value) if value is not None else None

    async def ready(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(f"{self.base_url}/health", headers=self._headers())
            return resp.status_code < 500
        except Exception:
            return False


_: type[SecretProvider] = HttpSecretProvider  # type: ignore[misc, assignment]
