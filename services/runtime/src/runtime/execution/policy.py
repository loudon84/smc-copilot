"""Approval / tool / data policy helpers for AgentExecutionKernel (PRD v1.3 §15.1)."""

from __future__ import annotations

from typing import Any


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    return [str(value)]


def tool_requires_approval(tool_name: str, approval_policy: dict[str, Any] | None) -> bool:
    """Return True when the tool must pause for human approval under the task policy."""
    if not approval_policy:
        return False
    name = (tool_name or "").strip().lower()
    auto = {x.strip().lower() for x in _as_list(approval_policy.get("autoApprove"))}
    require = {x.strip().lower() for x in _as_list(approval_policy.get("requireApproval"))}
    if name in auto:
        return False
    if name in require:
        return True
    mode = str(approval_policy.get("mode") or "").strip().lower()
    if mode == "always":
        return True
    if mode == "never":
        return False
    # risk_based default: write-like tools need approval when listed categories match
    risky_prefixes = ("write", "delete", "external", "payment", "shell", "exec")
    if any(name.startswith(p) or p in name for p in risky_prefixes) and require:
        return True
    return False


def tool_allowed(tool_name: str, tool_policy: dict[str, Any] | None) -> bool:
    if not tool_policy:
        return True
    name = (tool_name or "").strip().lower()
    denylist = {x.strip().lower() for x in _as_list(tool_policy.get("deny") or tool_policy.get("denylist"))}
    allowlist = {x.strip().lower() for x in _as_list(tool_policy.get("allow") or tool_policy.get("allowlist"))}
    if name in denylist:
        return False
    if allowlist and name not in allowlist:
        return False
    return True


def data_redaction_required(data_policy: dict[str, Any] | None) -> bool:
    if not data_policy:
        return True
    mode = str(data_policy.get("mode") or data_policy.get("redaction") or "redact").lower()
    return mode not in {"none", "off", "disabled"}
