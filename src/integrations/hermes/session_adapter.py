from __future__ import annotations

"""Hermes session adapter — Runtime only accesses sessions via this module."""

from typing import Any

from core.config import Settings
from core.runtime_errors import RuntimeServiceError


class HermesSessionAdapter:
    def __init__(self, settings: Settings, *, gateway_port: int | None = None) -> None:
        self._settings = settings
        self._port = gateway_port

    async def list_sessions(self, *, limit: int = 50) -> list[dict[str, Any]]:
        # Placeholder: real impl queries Hermes Gateway / home DB via HTTP/CLI
        return []

    async def get_session(self, session_id: str) -> dict[str, Any]:
        raise RuntimeServiceError(f"Session not found: {session_id}", code="not_found")

    async def delete_session(self, session_id: str) -> None:
        raise RuntimeServiceError(f"Session not found: {session_id}", code="not_found")

    async def search(self, query: str) -> list[dict[str, Any]]:
        return []
