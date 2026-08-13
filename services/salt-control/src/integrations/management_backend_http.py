from __future__ import annotations

import httpx

from core.errors import ErrorCode, SaltControlError
from integrations.management_backend import BackendDesiredState, BackendUserBinding, ManagementBackend

_SYSTEM_ACCOUNTS = frozenset({"system", "nt authority\\system", "nt authority/system", "localsystem"})


class HttpManagementBackend:
    """GET /internal/v1/endpoints/{endpointId}/binding|desired-state"""

    def __init__(self, base_url: str, *, token: str = "", timeout: float = 10.0) -> None:
        if not base_url.startswith("https://"):
            raise ValueError("management backend URL must be https")
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self._available = True

    @property
    def available(self) -> bool:
        return self._available

    def set_available(self, value: bool) -> None:
        self._available = value

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    async def get_binding(self, endpoint_id: str) -> BackendUserBinding | None:
        if not self._available:
            raise RuntimeError("management backend unavailable")
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(
                f"{self.base_url}/internal/v1/endpoints/{endpoint_id}/binding",
                headers=self._headers(),
            )
        if resp.status_code == 404:
            return None
        if resp.status_code >= 400:
            self._available = False
            raise RuntimeError("management backend binding error")
        data = resp.json()
        binding = BackendUserBinding(
            endpoint_id=str(data.get("endpointId") or endpoint_id),
            user_id=str(data["userId"]),
            windows_account=str(data["windowsAccount"]),
            windows_sid=str(data["windowsSid"]),
            profile_dir=str(data["profileDir"]),
            revision=str(data["revision"]),
        )
        if binding.endpoint_id != endpoint_id:
            raise SaltControlError(ErrorCode.VALIDATION_ERROR, "binding endpoint mismatch", status_code=400)
        fields = (binding.user_id, binding.windows_account, binding.windows_sid, binding.profile_dir, binding.revision)
        if any(not str(item).strip() for item in fields):
            raise SaltControlError(ErrorCode.VALIDATION_ERROR, "binding fields incomplete", status_code=400)
        if binding.windows_account.strip().lower() in _SYSTEM_ACCOUNTS:
            raise SaltControlError(ErrorCode.VALIDATION_ERROR, "system binding forbidden", status_code=400)
        return binding

    async def get_desired_state(self, endpoint_id: str) -> BackendDesiredState | None:
        if not self._available:
            raise RuntimeError("management backend unavailable")
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(
                f"{self.base_url}/internal/v1/endpoints/{endpoint_id}/desired-state",
                headers=self._headers(),
            )
        if resp.status_code == 404:
            return None
        if resp.status_code >= 400:
            self._available = False
            raise RuntimeError("management backend desired-state error")
        data = resp.json()
        hermes = data.get("hermes") or {}
        rollout = data.get("rollout") or {}
        return BackendDesiredState(
            endpoint_id=endpoint_id,
            revision=str(data["revision"]),
            user_id=str(data.get("userId") or ""),
            hermes_home=str(hermes.get("home") or data.get("hermesHome") or ""),
            hermes_version=str(hermes.get("version") or data.get("hermesVersion") or ""),
            artifact_ref=str(hermes.get("artifactRef") or data.get("artifactRef") or ""),
            ring=str(rollout.get("ring") or data.get("ring") or ""),
            desired_owner=str(rollout.get("desiredOwner") or data.get("desiredOwner") or "salt"),
            secrets=list(data.get("secrets") or []),
            profiles=list(data.get("profiles") or []),
            mcp=dict(data.get("mcp") or {}),
        )

    async def ready(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(f"{self.base_url}/health", headers=self._headers())
            ok = resp.status_code < 500
            self._available = ok
            return ok
        except Exception:
            self._available = False
            return False


_: type[ManagementBackend] = HttpManagementBackend  # type: ignore[misc, assignment]
