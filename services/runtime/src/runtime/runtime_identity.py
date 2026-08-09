"""Runtime process identity for Gateway ownership tracking (PRD v1.5.1 §7.3)."""

from __future__ import annotations

import uuid

# Generated once per Runtime Service process start.
_runtime_instance_id: str | None = None


def ensure_runtime_instance_id() -> str:
    global _runtime_instance_id
    if not _runtime_instance_id:
        _runtime_instance_id = str(uuid.uuid4())
    return _runtime_instance_id


def get_runtime_instance_id() -> str | None:
    return _runtime_instance_id


def reset_runtime_instance_id_for_tests() -> None:
    """Test-only: clear process-level identity."""
    global _runtime_instance_id
    _runtime_instance_id = None
