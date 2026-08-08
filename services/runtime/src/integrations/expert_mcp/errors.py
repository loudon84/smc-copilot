from __future__ import annotations

from core.runtime_errors import RuntimeServiceError


class ExpertMcpError(RuntimeServiceError):
    """Expert MCP Gateway domain error."""

    def __init__(self, message: str, *, code: str = "expert_mcp_error") -> None:
        super().__init__(message, code=code)
