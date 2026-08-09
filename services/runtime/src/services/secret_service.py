from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import sys
from datetime import UTC, datetime
from pathlib import Path

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

    async def ensure_api_server_key(
        self,
        profile_name: str,
        *,
        managed_install: bool = False,
    ) -> None:
        """Ensure API_SERVER_KEY for Gateway use (PRD v1.5.3).

        External/development Hermes (managed_install=False): read-only from
        ``~/.hermes/.env`` — never generate into Runtime SecretStore.

        Managed installs may generate a key and must write it to Hermes ``.env``
        (atomic write reserved for a later slice; currently raises if missing).
        """
        from runtime.local_hermes_profile_policy import require_supported_local_profile
        from services.hermes_local_config_service import HermesLocalConfigService

        scope = require_supported_local_profile(profile_name)
        local = HermesLocalConfigService(self._settings)
        existing = local.resolve_api_server_key(scope)
        if existing:
            return

        if not managed_install:
            raise RuntimeServiceError(
                "Hermes API Server key is not configured in ~/.hermes/.env",
                code="HERMES_API_SERVER_KEY_MISSING",
                details={"profileName": scope, "managedInstall": False},
            )

        # Managed install path: generate then write to Hermes .env (SOT), not SecretStore-only.
        value = secrets.token_urlsafe(32)
        env_path = local.env_path(scope)
        self._atomic_upsert_env_key(env_path, "API_SERVER_KEY", value)

    @staticmethod
    def _atomic_upsert_env_key(env_path: Path, key: str, value: str) -> None:
        """Atomically set KEY=value in a dotenv file, preserving other lines when practical."""
        import os
        import tempfile

        env_path.parent.mkdir(parents=True, exist_ok=True)
        existing_lines: list[str] = []
        if env_path.is_file():
            existing_lines = env_path.read_text(encoding="utf-8-sig").splitlines(keepends=True)

        key_line = f"{key}={value}\n"
        replaced = False
        out_lines: list[str] = []
        for line in existing_lines:
            stripped = line.lstrip()
            if stripped.startswith("#") or "=" not in line:
                out_lines.append(line)
                continue
            name = stripped.split("=", 1)[0].strip()
            if name.startswith("export "):
                name = name[len("export ") :].strip()
            if name == key:
                out_lines.append(key_line)
                replaced = True
            else:
                out_lines.append(line)
        if not replaced:
            if out_lines and not out_lines[-1].endswith("\n"):
                out_lines[-1] = out_lines[-1] + "\n"
            out_lines.append(key_line)

        fd, tmp_name = tempfile.mkstemp(dir=str(env_path.parent), prefix=".env.", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="") as tmp:
                tmp.writelines(out_lines)
                tmp.flush()
                os.fsync(tmp.fileno())
            os.replace(tmp_name, env_path)
        except Exception:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise
