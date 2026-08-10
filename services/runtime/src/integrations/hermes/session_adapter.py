from __future__ import annotations

"""Hermes session adapter — Runtime only accesses sessions via this module."""

import sqlite3
from pathlib import Path
from typing import Any

from core.config import Settings
from core.runtime_errors import RuntimeServiceError
from runtime.hermes_profile_paths import profile_home


class HermesSessionAdapter:
    def __init__(
        self,
        settings: Settings,
        *,
        gateway_port: int | None = None,
        profile_name: str | None = None,
    ) -> None:
        self._settings = settings
        self._port = gateway_port
        self._profile_name = profile_name

    def _state_db(self) -> Path:
        return profile_home(self._settings, self._profile_name) / "state.db"

    def _connect(self) -> sqlite3.Connection | None:
        db_path = self._state_db()
        if not db_path.exists():
            return None
        conn = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        return conn

    def _table_exists(self, conn: sqlite3.Connection, name: str) -> bool:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
            (name,),
        ).fetchone()
        return row is not None

    async def list_sessions(self, *, limit: int = 50) -> list[dict[str, Any]]:
        conn = self._connect()
        if conn is None:
            return []
        try:
            if not self._table_exists(conn, "sessions"):
                return []
            rows = conn.execute(
                "SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    async def get_session(self, session_id: str) -> dict[str, Any]:
        conn = self._connect()
        if conn is None:
            raise RuntimeServiceError(f"Session not found: {session_id}", code="not_found")
        try:
            if not self._table_exists(conn, "sessions"):
                raise RuntimeServiceError(f"Session not found: {session_id}", code="not_found")
            row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
            if row is None:
                raise RuntimeServiceError(f"Session not found: {session_id}", code="not_found")
            return dict(row)
        finally:
            conn.close()

    async def delete_session(self, session_id: str) -> None:
        db_path = self._state_db()
        if not db_path.exists():
            raise RuntimeServiceError(f"Session not found: {session_id}", code="not_found")
        conn = sqlite3.connect(str(db_path))
        try:
            if not self._table_exists(conn, "sessions"):
                raise RuntimeServiceError(f"Session not found: {session_id}", code="not_found")
            cur = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            if cur.rowcount == 0:
                raise RuntimeServiceError(f"Session not found: {session_id}", code="not_found")
            if self._table_exists(conn, "messages"):
                conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
            conn.commit()
        finally:
            conn.close()

    async def search(self, query: str) -> list[dict[str, Any]]:
        conn = self._connect()
        if conn is None or not query.strip():
            return []
        try:
            if not self._table_exists(conn, "sessions"):
                return []
            like = f"%{query.strip()}%"
            rows = conn.execute(
                "SELECT id, title, created_at, updated_at FROM sessions "
                "WHERE title LIKE ? OR id LIKE ? ORDER BY updated_at DESC LIMIT 50",
                (like, like),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    async def stats(self) -> dict[str, int]:
        """Return session/message counts from Hermes state.db (PRD v1.4 §31)."""
        conn = self._connect()
        if conn is None:
            return {"totalSessions": 0, "totalMessages": 0}
        try:
            total_sessions = 0
            total_messages = 0
            if self._table_exists(conn, "sessions"):
                row = conn.execute("SELECT COUNT(*) AS count FROM sessions").fetchone()
                total_sessions = int(row["count"] if row else 0)
            if self._table_exists(conn, "messages"):
                row = conn.execute("SELECT COUNT(*) AS count FROM messages").fetchone()
                total_messages = int(row["count"] if row else 0)
            return {"totalSessions": total_sessions, "totalMessages": total_messages}
        finally:
            conn.close()

    async def list_messages(self, session_id: str, *, limit: int = 500) -> list[dict[str, Any]]:
        conn = self._connect()
        if conn is None:
            return []
        try:
            if not self._table_exists(conn, "messages"):
                return []
            rows = conn.execute(
                "SELECT id, session_id, role, content, created_at, timestamp "
                "FROM messages WHERE session_id = ? ORDER BY COALESCE(timestamp, created_at, id) ASC LIMIT ?",
                (session_id, limit),
            ).fetchall()
            out: list[dict[str, Any]] = []
            for r in rows:
                d = dict(r)
                out.append(
                    {
                        "id": str(d.get("id") or ""),
                        "sessionId": str(d.get("session_id") or session_id),
                        "role": str(d.get("role") or "assistant"),
                        "content": str(d.get("content") or ""),
                        "timestamp": d.get("timestamp") or d.get("created_at"),
                    }
                )
            return out
        except sqlite3.OperationalError:
            # Older schemas may lack timestamp/created_at — fall back to SELECT *.
            try:
                rows = conn.execute(
                    "SELECT * FROM messages WHERE session_id = ? LIMIT ?",
                    (session_id, limit),
                ).fetchall()
                return [dict(r) for r in rows]
            except sqlite3.OperationalError:
                return []
        finally:
            conn.close()
