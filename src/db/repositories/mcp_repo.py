from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models.runtime import McpSecretRef, McpServer, McpTestResult, SecretReference


class McpServerRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_instance(self, instance_id: str) -> list[McpServer]:
        result = await self._session.execute(
            select(McpServer)
            .where(McpServer.instance_id == instance_id)
            .order_by(McpServer.created_at.asc())
        )
        return list(result.scalars().all())

    async def count_by_instance(self, instance_id: str) -> int:
        rows = await self.list_by_instance(instance_id)
        return len(rows)

    async def get(self, instance_id: str, server_id: str) -> McpServer | None:
        row = await self._session.get(McpServer, server_id)
        if row is None or row.instance_id != instance_id:
            return None
        return row

    async def get_by_name(self, instance_id: str, name: str) -> McpServer | None:
        result = await self._session.execute(
            select(McpServer).where(McpServer.instance_id == instance_id, McpServer.name == name)
        )
        return result.scalar_one_or_none()

    async def add(self, row: McpServer) -> McpServer:
        self._session.add(row)
        await self._session.flush()
        return row

    async def delete(self, row: McpServer) -> None:
        await self._session.delete(row)
        await self._session.flush()

    async def list_secret_refs(self, mcp_server_id: str) -> list[McpSecretRef]:
        result = await self._session.execute(
            select(McpSecretRef).where(McpSecretRef.mcp_server_id == mcp_server_id)
        )
        return list(result.scalars().all())

    async def replace_secret_refs(
        self,
        mcp_server_id: str,
        refs: list[tuple[str, str]],
    ) -> list[McpSecretRef]:
        existing = await self.list_secret_refs(mcp_server_id)
        for row in existing:
            await self._session.delete(row)
        created: list[McpSecretRef] = []
        for secret_name, secret_reference_id in refs:
            row = McpSecretRef(
                mcp_server_id=mcp_server_id,
                secret_name=secret_name,
                secret_reference_id=secret_reference_id,
            )
            self._session.add(row)
            created.append(row)
        await self._session.flush()
        return created

    async def resolve_secret_refs(self, mcp_server_id: str) -> list[tuple[str, SecretReference]]:
        refs = await self.list_secret_refs(mcp_server_id)
        resolved: list[tuple[str, SecretReference]] = []
        for ref in refs:
            secret_row = await self._session.get(SecretReference, ref.secret_reference_id)
            if secret_row is not None:
                resolved.append((ref.secret_name, secret_row))
        return resolved

    async def add_test_result(self, row: McpTestResult) -> McpTestResult:
        self._session.add(row)
        await self._session.flush()
        return row

    async def latest_test_result(self, mcp_server_id: str) -> McpTestResult | None:
        result = await self._session.execute(
            select(McpTestResult)
            .where(McpTestResult.mcp_server_id == mcp_server_id)
            .order_by(McpTestResult.tested_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    @staticmethod
    def args_from_json(args_json: str | None) -> list[str]:
        if not args_json:
            return []
        try:
            data = json.loads(args_json)
            return list(data) if isinstance(data, list) else []
        except json.JSONDecodeError:
            return []

    @staticmethod
    def args_to_json(args: list[str] | None) -> str | None:
        if not args:
            return None
        return json.dumps(list(args))

    @staticmethod
    def server_to_dict(row: McpServer) -> dict[str, Any]:
        return {
            "id": row.id,
            "name": row.name,
            "transport": row.transport,
            "command": row.command,
            "args": McpServerRepository.args_from_json(row.args_json),
            "url": row.url,
            "enabled": row.enabled,
            "status": row.status,
        }
