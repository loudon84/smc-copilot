"""Session Chat Settings — model override + context folder (PRD v1.6 FR-04/FR-08)."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.runtime_errors import RuntimeServiceError
from db.models.runtime import HermesInstance
from db.models.session_chat_settings import SessionChatSettings
from schemas.session_chat_settings import SessionChatSettingsPatchBody, SessionChatSettingsResponse


def _iso(dt: object | None) -> str | None:
    if dt is None:
        return None
    return getattr(dt, "isoformat", lambda: str(dt))()


class SessionChatSettingsService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def _require_instance(self, instance_id: str) -> HermesInstance:
        inst = await self._session.get(HermesInstance, instance_id)
        if inst is None:
            raise RuntimeServiceError(f"Instance not found: {instance_id}", code="not_found")
        return inst

    async def get(self, instance_id: str, session_id: str) -> SessionChatSettingsResponse:
        await self._require_instance(instance_id)
        row = await self._get_row(instance_id, session_id)
        if row is None:
            return SessionChatSettingsResponse(
                instanceId=instance_id,
                sessionId=session_id,
                modelId=None,
                contextFolder=None,
            )
        return self._to_response(row)

    async def patch(
        self,
        instance_id: str,
        session_id: str,
        body: SessionChatSettingsPatchBody,
    ) -> SessionChatSettingsResponse:
        await self._require_instance(instance_id)
        data = body.model_dump(by_alias=False, exclude_unset=True)

        if "context_folder" in data and data["context_folder"]:
            folder = str(data["context_folder"]).strip()
            path = Path(folder)
            if not path.is_absolute():
                raise RuntimeServiceError(
                    "contextFolder must be an absolute path",
                    code="invalid_context_folder",
                )
            # Soft validation: path should exist when set; allow create-later for UX.
            data["context_folder"] = str(path)

        if "model_id" in data and data["model_id"] == "smc-copilot":
            data["model_id"] = None

        row = await self._get_row(instance_id, session_id)
        if row is None:
            row = SessionChatSettings(
                instance_id=instance_id,
                session_id=session_id,
                model_id=data.get("model_id"),
                context_folder=data.get("context_folder"),
            )
            self._session.add(row)
        else:
            if "model_id" in data:
                row.model_id = data["model_id"]
            if "context_folder" in data:
                row.context_folder = data["context_folder"]
        await self._session.flush()
        return self._to_response(row)

    async def resolve_model_id(
        self,
        instance_id: str,
        session_id: str | None,
        *,
        turn_model_id: str | None = None,
        instance_default: str | None = None,
    ) -> str | None:
        """Priority: turn override > session override > instance default > Hermes yaml."""
        if turn_model_id:
            return turn_model_id
        if session_id:
            row = await self._get_row(instance_id, session_id)
            if row and row.model_id:
                return row.model_id
        return instance_default

    async def resolve_context_folder(self, instance_id: str, session_id: str | None) -> str | None:
        if not session_id:
            return None
        row = await self._get_row(instance_id, session_id)
        return row.context_folder if row else None

    async def _get_row(self, instance_id: str, session_id: str) -> SessionChatSettings | None:
        result = await self._session.execute(
            select(SessionChatSettings).where(
                SessionChatSettings.instance_id == instance_id,
                SessionChatSettings.session_id == session_id,
            )
        )
        return result.scalar_one_or_none()

    def _to_response(self, row: SessionChatSettings) -> SessionChatSettingsResponse:
        return SessionChatSettingsResponse(
            instanceId=row.instance_id,
            sessionId=row.session_id,
            modelId=row.model_id,
            contextFolder=row.context_folder,
            createdAt=_iso(row.created_at),
            updatedAt=_iso(row.updated_at),
        )
