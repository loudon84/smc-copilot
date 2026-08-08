from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from core.config import Settings
from runtime.platform_paths import RuntimeLayout

DEFAULT_MANAGED_SERVER_NAME = "smc-expert-gateway"
SECRET_SCOPE = "expert-mcp"
SECRET_NAME = "access-token"


class ExpertMcpDescriptor:
    """Persisted Expert MCP config under Runtime data dir."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        layout = RuntimeLayout.from_root(settings.resolved_runtime_data_dir())
        layout.ensure()
        self._path = layout.root / "expert_mcp_config.json"

    def load(self) -> dict[str, Any]:
        if not self._path.exists():
            return {
                "endpoint": "",
                "enabled": False,
                "managedServerName": DEFAULT_MANAGED_SERVER_NAME,
                "lastSyncAt": None,
                "toolCount": 0,
            }
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def save(self, data: dict[str, Any]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    @property
    def path(self) -> Path:
        return self._path
