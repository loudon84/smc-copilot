"""One-shot approval tokens bound to task/run/tool_call/arg hash (PRD FR-603)."""

from __future__ import annotations

import hashlib
import json
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta


@dataclass(frozen=True)
class ApprovalTokenClaims:
    task_id: str
    run_id: str
    tool_call_id: str
    arg_hash: str
    expires_at: datetime


@dataclass
class IssuedApprovalToken:
    token: str
    claims: ApprovalTokenClaims


# @lat: [[approval-workspace#Approval Token]]
class ApprovalTokenService:
    def __init__(self, *, default_ttl_seconds: int = 300) -> None:
        self._default_ttl = default_ttl_seconds
        self._used: set[str] = set()
        self._issued: dict[str, ApprovalTokenClaims] = {}

    @staticmethod
    def hash_args(args: dict | list | str | None) -> str:
        payload = json.dumps(args, sort_keys=True, default=str)
        return hashlib.sha256(payload.encode()).hexdigest()

    def issue(
        self,
        *,
        task_id: str,
        run_id: str,
        tool_call_id: str,
        args: dict | list | str | None = None,
        ttl_seconds: int | None = None,
    ) -> IssuedApprovalToken:
        arg_hash = self.hash_args(args)
        expires_at = datetime.now(UTC) + timedelta(seconds=ttl_seconds or self._default_ttl)
        token = secrets.token_urlsafe(32)
        claims = ApprovalTokenClaims(
            task_id=task_id,
            run_id=run_id,
            tool_call_id=tool_call_id,
            arg_hash=arg_hash,
            expires_at=expires_at,
        )
        self._issued[token] = claims
        return IssuedApprovalToken(token=token, claims=claims)

    def consume(
        self,
        token: str,
        *,
        task_id: str,
        run_id: str,
        tool_call_id: str,
        args: dict | list | str | None = None,
    ) -> bool:
        if token in self._used:
            return False
        claims = self._issued.get(token)
        if claims is None:
            return False
        if datetime.now(UTC) > claims.expires_at:
            return False
        if claims.task_id != task_id or claims.run_id != run_id or claims.tool_call_id != tool_call_id:
            return False
        if claims.arg_hash != self.hash_args(args):
            return False
        self._used.add(token)
        del self._issued[token]
        return True

    def invalidate_for_tool_call(self, tool_call_id: str) -> int:
        to_remove = [t for t, c in self._issued.items() if c.tool_call_id == tool_call_id]
        for t in to_remove:
            del self._issued[t]
        return len(to_remove)
