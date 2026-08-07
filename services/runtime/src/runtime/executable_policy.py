from __future__ import annotations

import re
from pathlib import Path

FORBIDDEN_SHELL_ENTRYPOINTS = frozenset(
    {
        "cmd",
        "cmd.exe",
        "powershell",
        "powershell.exe",
        "pwsh",
        "pwsh.exe",
        "bash",
        "sh",
        "zsh",
        "fish",
    }
)

FORBIDDEN_FLAGS = frozenset({"/c", "/C", "-Command", "-c", "-EncodedCommand"})


# @lat: [[approval-workspace#可执行策略]]
class ExecutablePolicy:
    """MCP / process executable policy (PRD §7.10)."""

    def validate_command(self, command: str | None, args: list[str] | None = None) -> None:
        from core.runtime_errors import RuntimeServiceError

        if not command or not str(command).strip():
            raise RuntimeServiceError("MCP command is required for stdio transport", code="validation_error")
        cmd = str(command).strip()
        if any(ch in cmd for ch in (";", "|", "&", "`", "\n", "\r")):
            raise RuntimeServiceError("Shell metacharacters are not allowed in MCP command", code="policy_denied")
        name = Path(cmd).name.lower()
        if name in FORBIDDEN_SHELL_ENTRYPOINTS:
            raise RuntimeServiceError(
                f"Forbidden shell entrypoint: {name}",
                code="policy_denied",
            )
        for arg in args or []:
            if arg in FORBIDDEN_FLAGS:
                raise RuntimeServiceError(f"Forbidden argument: {arg}", code="policy_denied")
            if re.search(r"[;&|`]", arg):
                raise RuntimeServiceError("Shell metacharacters are not allowed in MCP args", code="policy_denied")
