"""Load Windows Hermes runtime download pins from release config (not code)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from tools.release.simple_yaml import load_yaml

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_RUNTIME_PINS = ROOT / "release" / "hermes-windows-runtime.yaml"
SCHEMA = "smc.hermes.windows-runtime.v1"
FORBIDDEN_VERSIONS = {"latest", "current", "*", "unversioned", "main", "master", "auto"}
_CACHE: dict[str, Any] | None = None


def parse_version_tuple(version_str: str) -> tuple[int, ...]:
    return tuple(int(x) for x in str(version_str).split("."))


def requires_ranges(pins: dict[str, Any] | None = None) -> dict[str, str]:
    data = pins or load_windows_runtime_pins()
    return {
        "python": str(data["python"]["range"]),
        "node": str(data["node"]["range"]),
    }


def load_windows_runtime_pins(path: Path | None = None, *, reload: bool = False) -> dict[str, Any]:
    global _CACHE
    target = (path or DEFAULT_RUNTIME_PINS).resolve()
    if path is None and not reload and _CACHE is not None:
        return _CACHE
    if not target.is_file():
        raise ValueError(f"windows runtime pins missing: {target}")
    data = load_yaml(target)
    if not isinstance(data, dict) or data.get("schema") != SCHEMA:
        raise ValueError(f"invalid windows runtime pins: {target}")
    python = _require_component(data, "python", digest_key="sha256", require_range=True)
    node = _require_component(
        data,
        "node",
        digest_key="sha256",
        require_min_safe=True,
        require_range=True,
    )
    sqlite = _require_component(
        data,
        "sqlite",
        digest_key="sha3_256",
        require_min_safe=True,
        require_version_in_url=False,
    )
    mirrors = sqlite.get("mirrors")
    if not isinstance(mirrors, list) or not mirrors:
        raise ValueError("sqlite.mirrors missing")
    sqlite["mirrors"] = [_require_https(str(item), "sqlite.mirrors") for item in mirrors]
    pins = {"schema": SCHEMA, "python": python, "node": node, "sqlite": sqlite}
    if path is None:
        _CACHE = pins
    return pins


def _require_component(
    data: dict[str, Any],
    name: str,
    *,
    digest_key: str,
    require_min_safe: bool = False,
    require_range: bool = False,
    require_version_in_url: bool = True,
) -> dict[str, Any]:
    component = data.get(name)
    if not isinstance(component, dict):
        raise ValueError(f"{name} pin missing")
    version = _require_exact_version(component.get("version"), f"{name}.version")
    archive_url = _require_https(str(component.get("archiveUrl") or ""), f"{name}.archiveUrl")
    if require_version_in_url and version not in archive_url:
        raise ValueError(f"{name}.archiveUrl must contain {name}.version")
    digest = str(component.get(digest_key) or "").strip().lower()
    if len(digest) != 64 or any(ch not in "0123456789abcdef" for ch in digest):
        raise ValueError(f"{name}.{digest_key} must be a 64-char hex digest")
    payload: dict[str, Any] = {
        "version": version,
        "archiveUrl": archive_url,
        digest_key: digest,
    }
    range_text = str(component.get("range") or "").strip()
    if require_range and not range_text:
        raise ValueError(f"{name}.range missing")
    if range_text:
        payload["range"] = range_text
    if require_min_safe:
        min_safe = _require_exact_version(component.get("minSafe"), f"{name}.minSafe")
        if parse_version_tuple(version) < parse_version_tuple(min_safe):
            raise ValueError(f"{name}.version {version} below minSafe {min_safe}")
        payload["minSafe"] = min_safe
    if name == "sqlite":
        payload["mirrors"] = component.get("mirrors")
    return payload


def _require_exact_version(value: Any, field: str) -> str:
    text = str(value or "").strip()
    if not text or text.lower() in FORBIDDEN_VERSIONS:
        raise ValueError(f"forbidden {field}: {value}")
    parse_version_tuple(text)
    return text


def _require_https(url: str, field: str) -> str:
    text = str(url or "").strip()
    if not text.startswith("https://"):
        raise ValueError(f"{field} must be https")
    return text
