"""External pillar: Salt Control Desired State only. No mock_backend in production."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import quote

__virtualname__ = "smc_external"

SYSTEM_ACCOUNTS = frozenset({"system", "nt authority\\system", "nt authority/system", "localsystem"})


def __virtual__():
    return True


def _opts() -> dict[str, Any]:
    return globals().get("__opts__") or {}


def _salt_env() -> str:
    return os.environ.get("SMC_SALT_ENV", "lab").strip().lower() or "lab"


def _empty(error: str, source: str = "backend_unavailable") -> dict[str, Any]:
    return {"smc": {}, "smc_pillar_source": source, "smc_pillar_error": error}


def _config_from_args(args: tuple[Any, ...], kwargs: dict[str, Any]) -> dict[str, Any]:
    config: dict[str, Any] = {}
    if args and isinstance(args[0], dict):
        config.update(args[0])
    config.update(kwargs)
    return config


def _read_token(token_file: str) -> str | None:
    if not token_file:
        return None
    try:
        text = open(token_file, encoding="utf-8").read().strip()  # noqa: SIM115
    except OSError:
        return None
    return text or None


def _redact_error(exc: BaseException) -> str:
    text = str(exc)
    for secret in ("Bearer ", "token", "Token"):
        if secret in text:
            return type(exc).__name__
    return type(exc).__name__


def _http_json(url: str, token: str, timeout: float = 5.0) -> tuple[dict[str, Any] | None, str | None]:
    try:
        req = urllib.request.Request(url, method="GET")
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Accept", "application/json")
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
            payload = json.loads(resp.read().decode("utf-8"))
        if not isinstance(payload, dict):
            return None, "bad_json"
        return payload, None
    except urllib.error.HTTPError as exc:
        if exc.code in {401, 403}:
            return None, "auth_failed"
        if exc.code == 404:
            return None, "not_found"
        return None, f"http_{exc.code}"
    except TimeoutError:
        return None, "timeout"
    except (urllib.error.URLError, json.JSONDecodeError, OSError) as exc:
        return None, _redact_error(exc)


def _camel_get(data: dict[str, Any], camel: str, snake: str, default: Any = "") -> Any:
    if camel in data:
        return data.get(camel, default)
    return data.get(snake, default)


def _normalize_user(user: dict[str, Any] | None) -> dict[str, str] | None:
    if not isinstance(user, dict):
        return None
    return {
        "user_id": str(_camel_get(user, "userId", "user_id") or ""),
        "windows_account": str(_camel_get(user, "windowsAccount", "windows_account") or ""),
        "windows_sid": str(_camel_get(user, "windowsSid", "windows_sid") or ""),
        "profile_dir": str(_camel_get(user, "profileDir", "profile_dir") or ""),
    }


def _normalize_artifact(meta: dict[str, Any] | None, trusted_key_id: str, public_key: str) -> dict[str, str] | None:
    if not isinstance(meta, dict):
        return None
    key_id = str(_camel_get(meta, "keyId", "key_id") or "")
    if key_id != trusted_key_id:
        return None
    return {
        "url": str(meta.get("url") or ""),
        "sha256": str(meta.get("sha256") or ""),
        "signature": str(_camel_get(meta, "manifestSignature", "manifest_signature") or meta.get("signature") or ""),
        "key_id": key_id,
        "public_key": public_key,
    }


def _normalize_smc(
    desired: dict[str, Any],
    artifact: dict[str, str] | None,
) -> dict[str, Any] | None:
    user = _normalize_user(desired.get("user") if isinstance(desired.get("user"), dict) else desired)
    if user is None:
        return None
    account = user["windows_account"].strip().lower()
    if not all(user.values()) or account in SYSTEM_ACCOUNTS:
        return None
    hermes_in = desired.get("hermes") if isinstance(desired.get("hermes"), dict) else {}
    rollout_in = desired.get("rollout") if isinstance(desired.get("rollout"), dict) else {}
    hermes = {
        "home": str(_camel_get(hermes_in, "home", "home") or ""),
        "version": str(_camel_get(hermes_in, "version", "version") or ""),
        "artifact_ref": str(_camel_get(hermes_in, "artifactRef", "artifact_ref") or ""),
        "migrate_mode": bool(
            _camel_get(hermes_in, "migrateMode", "migrate_mode")
            if "migrateMode" in hermes_in or "migrate_mode" in hermes_in
            else True
        ),
    }
    if artifact:
        hermes["artifact"] = artifact
    else:
        hermes["artifact"] = {
            "url": "",
            "sha256": "",
            "signature": "",
            "key_id": "",
            "public_key": "",
        }
    return {
        "endpoint_id": str(_camel_get(desired, "endpointId", "endpoint_id") or ""),
        "revision": str(desired.get("revision") or ""),
        "user": user,
        "hermes": hermes,
        "profiles": list(desired.get("profiles") or []),
        "mcp": dict(desired.get("mcp") or {}),
        "secrets": list(desired.get("secrets") or []),
        "rollout": {
            "ring": str(_camel_get(rollout_in, "ring", "ring") or ""),
            "desired_owner": str(_camel_get(rollout_in, "desiredOwner", "desired_owner") or ""),
        },
    }


def ext_pillar(minion_id: str, pillar: dict[str, Any], *args: Any, **kwargs: Any) -> dict[str, Any]:
    """Salt external pillar entrypoint.

    Minion ID is device identity. Current user comes from Backend binding, never grains.
    Fail closed: empty smc + stable error code. Never log or return tokens.
    """
    del pillar
    config = _config_from_args(args, kwargs)
    if not str(minion_id).startswith("ep_"):
        return _empty("identity_adoption_required", source="identity_adoption_required")

    opts = _opts()
    resolver = opts.get("smc_desired_state_resolver")
    if callable(resolver) and _salt_env() in {"lab", "test"}:
        data = resolver(minion_id, config.get("user_id"))
        if not isinstance(data, dict):
            return _empty("resolver_invalid")
        return {"smc": data, "smc_pillar_source": "injected"}

    salt_control_url = str(config.get("salt_control_url") or "").strip()
    token_file = str(config.get("token_file") or "").strip()
    trusted_key_id = str(config.get("trusted_key_id") or "").strip()
    trusted_public_key_file = str(config.get("trusted_public_key_file") or "").strip()
    if _salt_env() == "production" and not salt_control_url.lower().startswith("https://"):
        return _empty("https_required")
    if not salt_control_url:
        return _empty("backend_url_missing")
    token = _read_token(token_file)
    if not token:
        return _empty("auth_failed")
    public_key = ""
    if trusted_public_key_file:
        try:
            public_key = open(trusted_public_key_file, encoding="utf-8").read().strip()  # noqa: SIM115
        except OSError:
            return _empty("key_unreadable")
    if not trusted_key_id or not public_key:
        return _empty("key_unreadable")

    endpoint_id = str(minion_id)
    desired_url = f"{salt_control_url.rstrip('/')}/salt/v1/endpoints/{quote(endpoint_id, safe='')}/desired-state"
    desired, err = _http_json(desired_url, token)
    if err or desired is None:
        return _empty(err or "backend_unreachable")

    hermes = desired.get("hermes") if isinstance(desired.get("hermes"), dict) else {}
    version = str(_camel_get(hermes, "version", "version") or "")
    arch = str(config.get("arch") or opts.get("cpuarch") or "AMD64")
    artifact: dict[str, str] | None = None
    if version:
        artifact_url = (
            f"{salt_control_url.rstrip('/')}/salt/v1/artifacts/hermes/{quote(version, safe='')}"
            f"?platform=windows&arch={quote(str(arch), safe='')}"
        )
        meta, artifact_err = _http_json(artifact_url, token)
        if artifact_err or meta is None:
            return _empty(artifact_err or "artifact_unavailable")
        artifact = _normalize_artifact(meta, trusted_key_id, public_key)
        if artifact is None:
            return _empty("key_id_mismatch")
        if not artifact["url"] or not artifact["sha256"] or not artifact["signature"]:
            return _empty("signature_missing")

    normalized = _normalize_smc(desired, artifact)
    if normalized is None:
        return _empty("binding_invalid")
    if not normalized.get("endpoint_id"):
        normalized["endpoint_id"] = endpoint_id
    if normalized["endpoint_id"] != endpoint_id:
        return _empty("identity_mismatch")
    return {"smc": normalized, "smc_pillar_source": "salt_control"}
