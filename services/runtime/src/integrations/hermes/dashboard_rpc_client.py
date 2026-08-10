"""Hermes Dashboard WebSocket JSON-RPC client (PRD v1.6 §47).

Desktop never sees the Dashboard WS URL. Runtime owns connect / request /
timeout / notification / reconnect for ``commands.catalog``, ``slash.exec``,
``command.dispatch``, and ``prompt.background``.
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from typing import Any
from urllib.parse import quote

import websockets
from websockets.asyncio.client import ClientConnection

from core.logging import get_logger
from core.runtime_errors import RuntimeServiceError

logger = get_logger(__name__)

DEFAULT_REQUEST_TIMEOUT_S = 30.0
DEFAULT_CONNECT_TIMEOUT_S = 2.5
DEFAULT_DASHBOARD_PORT = 9119


def resolve_dashboard_port(explicit: int | None = None) -> int:
    """Resolve Hermes Dashboard web port (never the Gateway /v1 port)."""
    if explicit is not None and 1 <= int(explicit) <= 65535:
        return int(explicit)
    env = (os.environ.get("HERMES_DASHBOARD_PORT") or "").strip()
    if env.isdigit():
        return int(env)
    return DEFAULT_DASHBOARD_PORT


class HermesDashboardRpcClient:
    """Async JSON-RPC 2.0 client over Hermes Dashboard ``/api/ws``.

    Important: Dashboard is a *separate* process from the Gateway api_server.
    Gateway (default 8642) serves ``/v1/*`` only — ``/api/ws`` lives on the
    Dashboard web server (commonly 9119 / ``HERMES_DASHBOARD_PORT``), not on
    ``gateway_port``.
    """

    def __init__(
        self,
        *,
        dashboard_port: int | None = None,
        gateway_port: int | None = None,
        api_key: str | None = None,
        request_timeout_s: float = DEFAULT_REQUEST_TIMEOUT_S,
        connect_timeout_s: float = DEFAULT_CONNECT_TIMEOUT_S,
    ) -> None:
        # Prefer explicit dashboard_port; gateway_port kept as deprecated alias
        # for call sites that have not migrated yet (will 404 on /api/ws).
        if dashboard_port is not None:
            port = int(dashboard_port)
        elif gateway_port is not None:
            # Mis-wiring gateway_port here historically caused /api/ws 404s.
            port = resolve_dashboard_port()
            logger.warning(
                "dashboard_rpc_gateway_port_ignored",
                gateway_port=gateway_port,
                dashboard_port=port,
            )
        else:
            port = resolve_dashboard_port()
        self._dashboard_port = port
        self._api_key = (api_key or "").strip() or None
        self._request_timeout_s = request_timeout_s
        self._connect_timeout_s = connect_timeout_s
        self._ws: ClientConnection | None = None
        self._pending: dict[str, asyncio.Future[Any]] = {}
        self._reader_task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()

    @property
    def ws_url(self) -> str:
        # Token is passed as query param (Hermes dashboard convention).
        token = quote(self._api_key or "", safe="")
        base = f"ws://127.0.0.1:{self._dashboard_port}/api/ws"
        return f"{base}?token={token}" if token else base

    @property
    def connected(self) -> bool:
        return self._ws is not None

    async def connect(self) -> None:
        async with self._lock:
            if self._ws is not None:
                return
            try:
                ws = await asyncio.wait_for(
                    websockets.connect(self.ws_url, open_timeout=self._connect_timeout_s),
                    timeout=self._connect_timeout_s,
                )
            except Exception as exc:
                raise RuntimeServiceError(
                    "Hermes Dashboard WebSocket unavailable",
                    code="dashboard_rpc_unavailable",
                ) from exc
            self._ws = ws
            self._reader_task = asyncio.create_task(self._read_loop(ws))

    async def close(self) -> None:
        async with self._lock:
            task = self._reader_task
            self._reader_task = None
            ws = self._ws
            self._ws = None
            for fut in self._pending.values():
                if not fut.done():
                    fut.set_exception(RuntimeServiceError("Dashboard RPC closed", code="dashboard_rpc_closed"))
            self._pending.clear()
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        if ws is not None:
            await ws.close()

    async def request(self, method: str, params: dict[str, Any] | None = None) -> Any:
        await self.connect()
        ws = self._ws
        if ws is None:
            raise RuntimeServiceError("Dashboard RPC not connected", code="dashboard_rpc_unavailable")

        req_id = str(uuid.uuid4())
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[Any] = loop.create_future()
        self._pending[req_id] = fut
        payload = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params or {},
        }
        try:
            await ws.send(json.dumps(payload))
            return await asyncio.wait_for(fut, timeout=self._request_timeout_s)
        except TimeoutError as exc:
            self._pending.pop(req_id, None)
            raise RuntimeServiceError(
                f"Dashboard RPC timeout: {method}",
                code="dashboard_rpc_timeout",
            ) from exc
        except Exception:
            self._pending.pop(req_id, None)
            raise

    async def commands_catalog(self) -> dict[str, Any]:
        result = await self.request("commands.catalog", {})
        return result if isinstance(result, dict) else {}

    async def slash_exec(self, *, command: str, session_id: str) -> Any:
        return await self.request(
            "slash.exec",
            {"command": command.lstrip("/"), "session_id": session_id or ""},
        )

    async def command_dispatch(self, *, name: str, arg: str, session_id: str) -> Any:
        return await self.request(
            "command.dispatch",
            {"name": name, "arg": arg, "session_id": session_id or ""},
        )

    async def prompt_background(
        self,
        *,
        session_id: str,
        message: str,
        parent_turn_id: str | None = None,
    ) -> Any:
        params: dict[str, Any] = {
            "session_id": session_id or "",
            "message": message,
        }
        if parent_turn_id:
            params["parent_turn_id"] = parent_turn_id
        return await self.request("prompt.background", params)

    async def _read_loop(self, ws: ClientConnection) -> None:
        try:
            async for raw in ws:
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if not isinstance(data, dict):
                    continue
                req_id = data.get("id")
                if req_id is None:
                    continue
                fut = self._pending.pop(str(req_id), None)
                if fut is None or fut.done():
                    continue
                if "error" in data and data["error"] is not None:
                    err = data["error"]
                    msg = err.get("message") if isinstance(err, dict) else str(err)
                    fut.set_exception(
                        RuntimeServiceError(msg or "Dashboard RPC error", code="dashboard_rpc_error")
                    )
                else:
                    fut.set_result(data.get("result"))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("dashboard_rpc_read_loop_ended", error=str(exc))
            for pending in list(self._pending.values()):
                if not pending.done():
                    pending.set_exception(
                        RuntimeServiceError("Dashboard RPC disconnected", code="dashboard_rpc_closed")
                    )
            self._pending.clear()
            self._ws = None
