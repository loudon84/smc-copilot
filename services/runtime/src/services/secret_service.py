from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import sys
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import HermesInstance, SecretReference
from runtime.gateway_environment import validate_secret_name
from runtime.platform_paths import RuntimeLayout
from schemas.runtime import SecretMetaResponse


class SecretStore:
    """Windows DPAPI store; insecure XOR file only when RUNTIME_ALLOW_INSECURE_SECRET_STORE=true."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        layout = RuntimeLayout.from_root(settings.resolved_runtime_data_dir())
        layout.ensure()
        self._store_path = layout.root / "secrets.enc.json"
        self._key = self._derive_key()
        self._allow_insecure = bool(getattr(settings, "runtime_allow_insecure_secret_store", False))

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

    def put(self, storage_key: str, value: str) -> str:
        """Persist secret; returns storage provider name."""
        if sys.platform == "win32":
            try:
                import win32crypt  # type: ignore

                encrypted = win32crypt.CryptProtectData(value.encode("utf-8"), None, None, None, None, 0)
                safe = storage_key.replace(":", "_").replace("/", "_")
                path = self._store_path.parent / f"{safe}.dpapi"
                path.write_bytes(encrypted)
                return "dpapi"
            except Exception as exc:
                if not self._allow_insecure:
                    raise RuntimeServiceError(
                        f"DPAPI secret store unavailable: {exc}",
                        code="secret_store_unavailable",
                    ) from exc
        elif not self._allow_insecure and sys.platform == "win32":
            raise RuntimeServiceError("DPAPI secret store unavailable", code="secret_store_unavailable")

        if sys.platform == "win32" and not self._allow_insecure:
            raise RuntimeServiceError("DPAPI secret store unavailable", code="secret_store_unavailable")

        # Non-Windows or explicit insecure fallback
        if sys.platform != "win32" or self._allow_insecure:
            data = self._load()
            data[storage_key] = value
            self._save(data)
            return "encrypted_file"

        raise RuntimeServiceError("Secret store unavailable", code="secret_store_unavailable")

    def get(self, storage_key: str) -> str | None:
        if sys.platform == "win32":
            safe = storage_key.replace(":", "_").replace("/", "_")
            path = self._store_path.parent / f"{safe}.dpapi"
            if path.exists():
                try:
                    import win32crypt  # type: ignore

                    _desc, plain = win32crypt.CryptUnprotectData(path.read_bytes(), None, None, None, 0)
                    return plain.decode("utf-8")
                except Exception as exc:
                    if not self._allow_insecure:
                        raise RuntimeServiceError(
                            f"DPAPI decrypt failed: {exc}",
                            code="secret_store_unavailable",
                        ) from exc
        return self._load().get(storage_key)

    def delete(self, storage_key: str) -> None:
        if sys.platform == "win32":
            safe = storage_key.replace(":", "_").replace("/", "_")
            path = self._store_path.parent / f"{safe}.dpapi"
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
        validate_secret_name(name)
        storage_key = f"{scope}:{name}"
        result = await self._session.execute(
            select(SecretReference).where(
                SecretReference.scope_type == "scope",
                SecretReference.scope_id == scope,
                SecretReference.secret_name == name,
            )
        )
        row = result.scalar_one_or_none()
        provider = self._store.put(storage_key, value)
        now = datetime.now(UTC)
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

    async def put_with_restart_hint(self, scope: str, name: str, value: str) -> dict:
        meta = await self.put(scope, name, value)
        # If any running instance uses this profile scope, caller should restart.
        result = await self._session.execute(
            select(HermesInstance).where(
                HermesInstance.profile_name == scope,
                HermesInstance.status.in_(("running", "starting")),
            )
        )
        running = list(result.scalars().all())
        payload = meta.model_dump(by_alias=True)
        if running:
            payload["restartRequired"] = True
        return payload

    async def list_meta(self, scope: str) -> list[SecretMetaResponse]:
        result = await self._session.execute(
            select(SecretReference).where(
                SecretReference.scope_type == "scope",
                SecretReference.scope_id == scope,
            )
        )
        rows = list(result.scalars().all())
        return [SecretMetaResponse(name=r.secret_name, configured=True, updatedAt=r.updated_at) for r in rows]

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

    async def ensure_api_server_key(self, profile_name: str) -> None:
        """FR-08: create API_SERVER_KEY via CSPRNG if missing for profile scope."""
        name = "API_SERVER_KEY"
        scope = profile_name or "default"
        result = await self._session.execute(
            select(SecretReference).where(
                SecretReference.scope_type == "scope",
                SecretReference.scope_id == scope,
                SecretReference.secret_name == name,
            )
        )
        row = result.scalar_one_or_none()
        if row is not None:
            existing = self._store.get(row.storage_key)
            if existing:
                return
        # 32 bytes CSPRNG → urlsafe text
        value = secrets.token_urlsafe(32)
        await self.put(scope, name, value)
