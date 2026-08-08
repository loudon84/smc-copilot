from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from integrations.expert_mcp.descriptor import SECRET_NAME, SECRET_SCOPE
from services.secret_service import SecretService


class ExpertMcpAuthProvider:
    """Resolve Expert MCP Bearer from Runtime SecretStore (never returned to Desktop)."""

    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._session = session
        self._secrets = SecretService(settings, session)
        self._storage_key = f"{SECRET_SCOPE}:{SECRET_NAME}"

    def get_token(self) -> str | None:
        return self._secrets.resolve(self._storage_key)

    async def put_token(self, token: str) -> None:
        await self._secrets.put(SECRET_SCOPE, SECRET_NAME, token)

    async def delete_token(self) -> None:
        try:
            await self._secrets.delete(SECRET_SCOPE, SECRET_NAME)
        except Exception:
            pass

    def authorization_configured(self) -> bool:
        token = self.get_token()
        return bool(token and token.strip())

    def auth_headers(self) -> dict[str, str]:
        token = self.get_token()
        if not token:
            return {}
        return {"Authorization": f"Bearer {token}"}
