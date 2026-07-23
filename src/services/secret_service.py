from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import SecretReference
from runtime.platform_paths import RuntimeLayout
from schemas.runtime import SecretMetaResponse


class SecretStore:
    """Dev encrypted-file store; Windows can use DPAPI when available."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        layout = RuntimeLayout.from_root(settings.resolved_runtime_data_dir())
        layout.ensure()
        self._store_path = layout.root / "secrets.enc.json"
        self._key = self._derive_key()

    def _derive_key(self) -> bytes:
        seed = os.environ.get("RUNTIME_SECRET_KEY", "dev-only-not-for-production")
        return hashlib.sha256(seed.encode("utf-8")).digest()

    def _xor(self, data: bytes) -> bytes:
        key = self._key
        return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))

    def _load(self) -> dict[str, str]:
        if not self._store_path.exists():
            return {}
        raw = self._store_path.read_bytes()
        try:
            plain = self._xor(base64.b64decode(raw))
            data = json.loads(plain.decode("utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _save(self, data: dict[str, str]) -> None:
        plain = json.dumps(data).encode("utf-8")
        blob = base64.b64encode(self._xor(plain))
        self._store_path.write_bytes(blob)

    def put(self, storage_key: str, value: str) -> None:
        if sys.platform == "win32":
            try:
                import win32crypt  # type: ignore

                encrypted = win32crypt.CryptProtectData(value.encode("utf-8"), None, None, None, None, 0)
                path = self._store_path.parent / f"{storage_key}.dpapi"
                path.write_bytes(encrypted)
                return
            except Exception:
                pass
        data = self._load()
        data[storage_key] = value
        self._save(data)

    def get(self, storage_key: str) -> str | None:
        if sys.platform == "win32":
            path = self._store_path.parent / f"{storage_key}.dpapi"
            if path.exists():
                try:
                    import win32crypt  # type: ignore

                    _desc, plain = win32crypt.CryptUnprotectData(path.read_bytes(), None, None, None, 0)
                    return plain.decode("utf-8")
                except Exception:
                    pass
        return self._load().get(storage_key)

    def delete(self, storage_key: str) -> None:
        if sys.platform == "win32":
            path = self._store_path.parent / f"{storage_key}.dpapi"
            if path.exists():
                path.unlink(missing_ok=True)
        data = self._load()
        data.pop(storage_key, None)
        self._save(data)


class SecretService:
    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._session = session
        self._store = SecretStore(settings)

    async def put(self, scope: str, name: str, value: str) -> SecretMetaResponse:
        if not value:
            raise RuntimeServiceError("Secret value required", code="validation_error")
        storage_key = f"{scope}:{name}"
        result = await self._session.execute(
            select(SecretReference).where(
                SecretReference.scope_type == "scope",
                SecretReference.scope_id == scope,
                SecretReference.secret_name == name,
            )
        )
        row = result.scalar_one_or_none()
        provider = "dpapi" if sys.platform == "win32" else "encrypted_file"
        self._store.put(storage_key, value)
        now = datetime.now(timezone.utc)
        if row is None:
            row = SecretReference(
                scope_type="scope",
                scope_id=scope,
                secret_name=name,
                storage_provider=provider,
                storage_key=storage_key,
            )
            self._session.add(row)
        else:
            row.storage_provider = provider
            row.storage_key = storage_key
            row.updated_at = now
        await self._session.flush()
        return SecretMetaResponse(name=name, configured=True, updatedAt=row.updated_at or now)

    async def list_meta(self, scope: str) -> list[SecretMetaResponse]:
        result = await self._session.execute(
            select(SecretReference).where(
                SecretReference.scope_type == "scope",
                SecretReference.scope_id == scope,
            )
        )
        rows = list(result.scalars().all())
        return [
            SecretMetaResponse(name=r.secret_name, configured=True, updatedAt=r.updated_at)
            for r in rows
        ]

    async def delete(self, scope: str, name: str) -> None:
        result = await self._session.execute(
            select(SecretReference).where(
                SecretReference.scope_type == "scope",
                SecretReference.scope_id == scope,
                SecretReference.secret_name == name,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise RuntimeServiceError(f"Secret not found: {name}", code="not_found")
        self._store.delete(row.storage_key)
        await self._session.delete(row)
        await self._session.flush()

    def resolve(self, storage_key: str) -> str | None:
        """Internal only — never expose via GET APIs."""
        return self._store.get(storage_key)
