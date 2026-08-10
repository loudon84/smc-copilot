"""Chat Command Service — catalog + slash.exec bridge (PRD v1.6 FR-01/FR-02)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.logging import get_logger
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import HermesInstance
from integrations.hermes.dashboard_rpc_client import (
    HermesDashboardRpcClient,
    resolve_dashboard_port,
)
from schemas.chat_commands import (
    ChatCommandExecuteBody,
    ChatCommandExecuteResponse,
    ChatCommandItem,
    ChatCommandsResponse,
)
from services.gateway_credential_service import GatewayCredentialService

logger = get_logger(__name__)

# Fail-closed fallback when Dashboard RPC is unavailable — empty catalog (PRD §48).
# Known agent command names used only to normalize execute routing, not as Desktop SOT.
_KNOWN_AGENT_NAMES = frozenset(
    {
        "status",
        "compact",
        "compress",
        "retry",
        "tools",
        "skills",
        "memory",
        "learn",
        "btw",
        "bg",
        "background",
        "undo",
        "reset",
        "usage",
        "debug",
        "approve",
        "deny",
    }
)


class ChatCommandService:
    def __init__(self, session: AsyncSession, settings: Any) -> None:
        self._session = session
        self._settings = settings
        self._credentials = GatewayCredentialService(settings, session)

    async def list_commands(self, instance_id: str) -> ChatCommandsResponse:
        client = await self._try_rpc(instance_id)
        if client is None:
            return ChatCommandsResponse(commands=[], rpcReady=False)
        try:
            raw = await client.commands_catalog()
            commands = self._parse_catalog(raw)
            return ChatCommandsResponse(commands=commands, rpcReady=True)
        except Exception as exc:
            logger.warning("commands_catalog_failed", error=str(exc), instance_id=instance_id)
            return ChatCommandsResponse(commands=[], rpcReady=False)
        finally:
            await client.close()

    async def execute(
        self,
        run_id: str,
        body: ChatCommandExecuteBody,
        *,
        instance_id: str,
    ) -> ChatCommandExecuteResponse:
        name = body.name.strip().lstrip("/").lower()
        args = (body.args or "").strip()
        session_id = body.session_id or ""
        command = f"{name} {args}".strip() if args else name

        client = await self._try_rpc(instance_id)
        if client is None:
            return ChatCommandExecuteResponse(
                result="error",
                message="Hermes Dashboard RPC unavailable",
                details={"runId": run_id, "name": name},
            )

        try:
            # Emit handled/send_prompt/error normalized from slash.exec + command.dispatch.
            try:
                raw = await client.slash_exec(command=command, session_id=session_id)
                outcome = self._normalize_outcome(raw, name=name, args=args)
                if outcome is not None:
                    return outcome
            except RuntimeServiceError:
                pass

            try:
                raw = await client.command_dispatch(name=name, arg=args, session_id=session_id)
                outcome = self._normalize_outcome(raw, name=name, args=args)
                if outcome is not None:
                    return outcome
            except RuntimeServiceError as exc:
                return ChatCommandExecuteResponse(result="error", message=str(exc))

            return ChatCommandExecuteResponse(
                result="error",
                message=f"Unknown or unhandled command /{name}",
            )
        finally:
            await client.close()

    async def _try_rpc(self, instance_id: str) -> HermesDashboardRpcClient | None:
        inst = await self._session.get(HermesInstance, instance_id)
        if inst is None:
            raise RuntimeServiceError(f"Instance not found: {instance_id}", code="not_found")
        dashboard_port = resolve_dashboard_port(
            getattr(self._settings, "hermes_dashboard_port", None)
        )
        try:
            creds = await self._credentials.resolve_for_instance(instance_id)
            return HermesDashboardRpcClient(
                dashboard_port=dashboard_port,
                api_key=creds.api_server_key,
            )
        except Exception as exc:
            logger.warning("dashboard_rpc_create_failed", error=str(exc), instance_id=instance_id)
            return HermesDashboardRpcClient(
                dashboard_port=dashboard_port,
                api_key=None,
            )

    def _parse_catalog(self, raw: dict[str, Any]) -> list[ChatCommandItem]:
        pairs: list[tuple[str, str]] = []
        if isinstance(raw.get("pairs"), list):
            for item in raw["pairs"]:
                if isinstance(item, (list, tuple)) and len(item) >= 2:
                    pairs.append((str(item[0]), str(item[1])))
        categories = raw.get("categories")
        if isinstance(categories, list):
            for cat in categories:
                if not isinstance(cat, dict):
                    continue
                for item in cat.get("pairs") or []:
                    if isinstance(item, (list, tuple)) and len(item) >= 2:
                        pairs.append((str(item[0]), str(item[1])))

        seen: set[str] = set()
        out: list[ChatCommandItem] = []
        for raw_name, description in pairs:
            name = raw_name.strip().lstrip("/").lower()
            if not name or name in seen:
                continue
            seen.add(name)
            out.append(
                ChatCommandItem(
                    name=name,
                    description=description or f"Hermes Agent /{name}",
                    category="agent",
                    target="agent",
                    allowWhileBusy=True,
                    supportsAttachments=False,
                    argsHint=None,
                )
            )
        return out

    def _normalize_outcome(
        self, raw: Any, *, name: str, args: str
    ) -> ChatCommandExecuteResponse | None:
        if raw is None:
            return None
        if isinstance(raw, dict):
            dtype = str(raw.get("type") or "").lower()
            if dtype in {"exec", "plugin"}:
                return ChatCommandExecuteResponse(
                    result="handled",
                    output=str(raw.get("output") or ""),
                )
            if dtype == "send":
                return ChatCommandExecuteResponse(
                    result="send_prompt",
                    prompt=str(raw.get("message") or ""),
                )
            if dtype == "skill":
                skill_name = str(raw.get("name") or name)
                msg = str(raw.get("message") or f"Use skill {skill_name}")
                return ChatCommandExecuteResponse(result="send_prompt", prompt=msg)
            if dtype == "alias":
                target = str(raw.get("target") or "")
                return ChatCommandExecuteResponse(
                    result="send_prompt",
                    prompt=f"/{target} {args}".strip(),
                )
            if "output" in raw:
                return ChatCommandExecuteResponse(
                    result="handled",
                    output=str(raw.get("output") or ""),
                )
            if raw.get("error"):
                return ChatCommandExecuteResponse(
                    result="error",
                    message=str(raw.get("error")),
                )
        if isinstance(raw, str):
            return ChatCommandExecuteResponse(result="handled", output=raw)
        return None
