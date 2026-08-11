"""Map Hermes CLI failures to standardized Runtime Kanban error codes (PRD §57)."""

from __future__ import annotations

from core.runtime_errors import RuntimeServiceError

_TIMEOUT_CODE = "KANBAN_TIMEOUT"


def raise_for_cli_failure(
    *,
    exit_code: int,
    stdout: str,
    stderr: str,
    default_code: str = "KANBAN_DISPATCH_FAILED",
) -> None:
    """Raise RuntimeServiceError with a stable code derived from CLI output."""
    if exit_code == 0:
        return
    text = f"{stderr}\n{stdout}".strip().lower()
    code = default_code
    message = (stderr or stdout or "Hermes kanban command failed").strip()

    if "not found" in text and "board" in text:
        code = "KANBAN_BOARD_NOT_FOUND"
    elif "not found" in text and "task" in text:
        code = "KANBAN_TASK_NOT_FOUND"
    elif "invalid transition" in text or "cannot move" in text or "not allowed" in text:
        code = "KANBAN_INVALID_TRANSITION"
    elif "depend" in text and ("block" in text or "unmet" in text or "incomplete" in text):
        code = "KANBAN_DEPENDENCY_BLOCKED"
    elif "already running" in text or "task is running" in text:
        code = "KANBAN_TASK_RUNNING"
    elif "workspace" in text and ("invalid" in text or "not exist" in text or "denied" in text):
        code = "KANBAN_WORKSPACE_INVALID"
    elif "timed out" in text or "timeout" in text:
        code = _TIMEOUT_CODE
    elif "kanban" in text and ("unknown" in text or "no such command" in text or "unsupported" in text):
        code = "HERMES_KANBAN_UNSUPPORTED"
    elif "no such file" in text or "executable not found" in text:
        code = "HERMES_NOT_INSTALLED"

    raise RuntimeServiceError(
        message[:2000] or "Hermes kanban command failed",
        code=code,
        details={
            "exitCode": exit_code,
            "stderrTail": (stderr or "")[-2000:],
            "stdoutTail": (stdout or "")[-1000:],
        },
    )


def map_executable_missing(exc: Exception) -> RuntimeServiceError:
    return RuntimeServiceError(
        str(exc) or "Hermes executable not found",
        code="HERMES_NOT_INSTALLED",
    )
