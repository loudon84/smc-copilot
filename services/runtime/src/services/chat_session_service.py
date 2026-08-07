from __future__ import annotations

import sqlite3
from pathlib import Path

from core.errors import profile_not_deployed
from db.repositories.profile_repo import ProfileRepository
from schemas.chat import WorkspaceChatSessionMessage, WorkspaceChatSessionMessagesResponse
from services.profile_ref_resolver import ProfileRefResolver


class ChatSessionService:
    def __init__(self, profile_repo: ProfileRepository) -> None:
        self._resolver = ProfileRefResolver(profile_repo)

    async def list_messages(
        self, profile_id: str, session_id: str
    ) -> WorkspaceChatSessionMessagesResponse:
        profile = await self._resolver.require_profile(profile_id)
        profile_path = (profile.profile_path or "").strip()
        if not profile_path or not Path(profile_path).exists():
            raise profile_not_deployed(profile_id=profile_id)

        db_path = Path(profile_path) / "state.db"
        if not db_path.is_file():
            return WorkspaceChatSessionMessagesResponse(messages=[])

        try:
            conn = sqlite3.connect(str(db_path))
            try:
                rows = conn.execute(
                    """
                    SELECT id, role, content, timestamp
                    FROM messages
                    WHERE session_id = ? AND role IN ('user', 'assistant') AND content IS NOT NULL
                    ORDER BY timestamp, id
                    """,
                    (session_id,),
                ).fetchall()
            finally:
                conn.close()
        except sqlite3.Error:
            return WorkspaceChatSessionMessagesResponse(messages=[])

        messages = [
            WorkspaceChatSessionMessage(
                id=int(r[0]),
                role=str(r[1]),
                content=str(r[2]),
                timestamp=int(r[3]),
            )
            for r in rows
        ]
        return WorkspaceChatSessionMessagesResponse(messages=messages)
