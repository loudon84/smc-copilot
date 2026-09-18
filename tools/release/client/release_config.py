"""Load and validate smc.client-release.config.v2."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, urlunparse

from tools.release.simple_yaml import load_yaml

SCHEMA = "smc.client-release.config.v2"
SCHEMA_V1 = "smc.client-release.config.v1"

_AUTH_MODES = frozenset(
    {"anonymous-internal", "git-credential-manager", "ssh-agent"}
)
_CHANNELS = frozenset({"lab", "stable"})
_COMMIT_RE = re.compile(r"^[0-9a-fA-F]{40}$")

_SOURCE_KEYS = frozenset(
    {
        "installUrl",
        "repositoryHttp",
        "repositoryHttps",
        "repositorySsh",
        "schemeAliases",
        "allowedHosts",
        "defaultBranch",
        "approvedCommit",
        "publicUpstreamAllowedOnEndpoint",
    }
)
_COMPAT_KEYS = frozenset({"minVersion", "testedVersion"})
_GATEWAY_KEYS = frozenset({"host", "port"})
_BOOTSTRAP_KEYS = frozenset({"authMode"})
_UPDATE_KEYS = frozenset({"policy"})


class ReleaseConfigInvalid(ValueError):
    """Raised when release YAML fails v2 validation (RELEASE_CONFIG_INVALID)."""

    def __init__(self, detail: str) -> None:
        super().__init__(f"RELEASE_CONFIG_INVALID: {detail}")


def _invalid(detail: str) -> None:
    raise ReleaseConfigInvalid(detail)


def _strip_userinfo(url: str) -> str:
    parsed = urlparse(url.strip())
    if not parsed.scheme and "@" in url and ":" in url:
        # SCP-style git@host:path — no userinfo beyond the git user in host part
        return url.strip()
    host = parsed.hostname or ""
    if parsed.port:
        netloc = f"{host}:{parsed.port}"
    else:
        netloc = host
    return urlunparse(
        (parsed.scheme, netloc, parsed.path, parsed.params, parsed.query, parsed.fragment)
    )


def _url_for_compare(url: str) -> str:
    """Normalize URL for installUrl ↔ repository* equality (strip userinfo)."""
    return _strip_userinfo(url).rstrip("/")


def canonical_repository_key(url: str) -> str:
    """Return canonical repository key per PRD §12.2: ``git|host|path``."""
    raw = (url or "").strip()
    if not raw:
        _invalid("empty repository URL")

    # Normalize SCP form git@host:path → host + path (scheme-class remains git).
    if re.match(r"^git@[^/]+:", raw):
        host_path = raw[len("git@") :]
        host, _, path = host_path.partition(":")
        scheme_host = host.lower()
        path = path.lstrip("/")
    elif raw.startswith("ssh://"):
        parsed = urlparse(_strip_userinfo(raw))
        scheme_host = (parsed.hostname or "").lower()
        path = (parsed.path or "").lstrip("/")
    else:
        cleaned = _strip_userinfo(raw)
        parsed = urlparse(cleaned)
        scheme_host = (parsed.hostname or "").lower()
        path = (parsed.path or "").lstrip("/")

    path = path.rstrip("/")
    if path.endswith(".git"):
        path = path[: -len(".git")]

    if not scheme_host or not path:
        _invalid(f"cannot derive canonical repository key from URL: {url!r}")

    return f"git|{scheme_host}|{path}"


def repository_identity(url: str) -> str:
    """SHA256 hex digest of the UTF-8 canonical repository key, prefixed ``sha256:``."""
    key = canonical_repository_key(url)
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def _host_of(url: str) -> str:
    raw = url.strip()
    if re.match(r"^git@[^/]+:", raw):
        return raw[len("git@") :].partition(":")[0].lower()
    parsed = urlparse(_strip_userinfo(raw))
    host = (parsed.hostname or "").lower()
    if not host:
        _invalid(f"cannot parse host from URL: {url!r}")
    return host


def _reject_unknown(obj: dict[str, Any], allowed: frozenset[str], label: str) -> None:
    unknown = sorted(set(obj) - allowed)
    if unknown:
        _invalid(f"{label} has unknown keys: {', '.join(unknown)}")


def _require_str(obj: dict[str, Any], key: str, label: str) -> str:
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip():
        _invalid(f"{label}.{key} must be a non-empty string")
    return value.strip()


def _validate_hermes(hermes: Any) -> dict[str, Any]:
    if not isinstance(hermes, dict):
        _invalid("hermes must be an object")

    if hermes.get("distribution") != "enterprise-native":
        _invalid("hermes.distribution must be enterprise-native")

    source = hermes.get("source")
    if not isinstance(source, dict):
        _invalid("hermes.source must be an object")
    _reject_unknown(source, _SOURCE_KEYS, "hermes.source")

    install_url = source.get("installUrl")
    if not isinstance(install_url, str) or not install_url.strip():
        _invalid("hermes.source.installUrl is required")
    install_url = install_url.strip()

    listed: list[tuple[str, str]] = []
    for key in ("repositoryHttp", "repositoryHttps", "repositorySsh"):
        value = source.get(key)
        if value is None or value == "":
            continue
        if not isinstance(value, str):
            _invalid(f"hermes.source.{key} must be a string when present")
        listed.append((key, value.strip()))

    if not listed:
        _invalid(
            "hermes.source requires at least one of "
            "repositoryHttp|repositoryHttps|repositorySsh"
        )

    install_cmp = _url_for_compare(install_url)
    listed_cmps = {_url_for_compare(u) for _, u in listed}
    if install_cmp not in listed_cmps:
        _invalid(
            "hermes.source.installUrl must equal one of the listed repository* URLs "
            "(userinfo stripped for compare)"
        )

    protocol_count = len(listed)
    aliases = source.get("schemeAliases")
    if protocol_count >= 2:
        if not isinstance(aliases, list) or len(aliases) < 1:
            _invalid(
                "hermes.source.schemeAliases is required when ≥2 repository protocols "
                "are listed"
            )
    elif aliases is not None and aliases not in ([], None):
        # Optional when single protocol; reject non-list junk
        if not isinstance(aliases, list):
            _invalid("hermes.source.schemeAliases must be a list when present")

    hosts = source.get("allowedHosts")
    if not isinstance(hosts, list) or not hosts or not all(
        isinstance(h, str) and h.strip() for h in hosts
    ):
        _invalid("hermes.source.allowedHosts must be a non-empty string list")
    hosts_norm = [h.strip().lower() for h in hosts]
    install_host = _host_of(install_url)
    if install_host not in hosts_norm:
        _invalid(
            f"hermes.source.allowedHosts must include installUrl host {install_host!r}"
        )

    _require_str(source, "defaultBranch", "hermes.source")
    approved = _require_str(source, "approvedCommit", "hermes.source")
    if not _COMMIT_RE.match(approved):
        _invalid("hermes.source.approvedCommit must be a 40-char hex SHA")

    if source.get("publicUpstreamAllowedOnEndpoint") is not False:
        _invalid("hermes.source.publicUpstreamAllowedOnEndpoint must be false")

    update = hermes.get("update")
    if not isinstance(update, dict):
        _invalid("hermes.update must be an object")
    _reject_unknown(update, _UPDATE_KEYS, "hermes.update")
    if update.get("policy") != "follow-defaultBranch":
        _invalid("hermes.update.policy must be follow-defaultBranch")

    compatibility = hermes.get("compatibility")
    if not isinstance(compatibility, dict):
        _invalid("hermes.compatibility must be an object")
    _reject_unknown(compatibility, _COMPAT_KEYS, "hermes.compatibility")
    _require_str(compatibility, "minVersion", "hermes.compatibility")
    _require_str(compatibility, "testedVersion", "hermes.compatibility")

    gateway = hermes.get("gateway")
    if not isinstance(gateway, dict):
        _invalid("hermes.gateway must be an object")
    _reject_unknown(gateway, _GATEWAY_KEYS, "hermes.gateway")
    _require_str(gateway, "host", "hermes.gateway")
    port = gateway.get("port")
    if not isinstance(port, int) or isinstance(port, bool) or port < 1 or port > 65535:
        _invalid("hermes.gateway.port must be an int 1..65535")

    policy = hermes.get("policy")
    if not isinstance(policy, dict):
        _invalid("hermes.policy must be an object")
    _require_str(policy, "version", "hermes.policy")

    bootstrap = hermes.get("bootstrap")
    if not isinstance(bootstrap, dict):
        _invalid("hermes.bootstrap must be an object")
    _reject_unknown(bootstrap, _BOOTSTRAP_KEYS, "hermes.bootstrap")
    auth_mode = bootstrap.get("authMode")
    if auth_mode not in _AUTH_MODES:
        _invalid(
            "hermes.bootstrap.authMode must be one of "
            "anonymous-internal|git-credential-manager|ssh-agent"
        )

    # Resolved identity attached for consumers (not present in YAML input).
    identity = repository_identity(install_url)
    resolved_source = dict(source)
    resolved_source["identity"] = identity
    resolved = dict(hermes)
    resolved["source"] = resolved_source
    return resolved


def load_release_config(path: Path) -> dict[str, Any]:
    """Load and validate a v2 client release config (production path is v2-only)."""
    data = load_yaml(path)
    if not isinstance(data, dict):
        _invalid(f"config root must be a mapping: {path}")

    schema = data.get("schema")
    if schema == SCHEMA_V1:
        _invalid(
            f"schema {SCHEMA_V1!r} is no longer accepted; use {SCHEMA!r} ({path})"
        )
    if schema != SCHEMA:
        _invalid(f"schema must be {SCHEMA!r}, got {schema!r} ({path})")

    release = data.get("release")
    if not isinstance(release, dict):
        _invalid("release must be an object")
    _require_str(release, "version", "release")
    channel = release.get("channel")
    if channel not in _CHANNELS:
        _invalid("release.channel must be lab|stable")

    work = data.get("work")
    if not isinstance(work, dict):
        _invalid("work must be an object")
    if not isinstance(work.get("enabled"), bool):
        _invalid("work.enabled must be a bool")

    hermes = _validate_hermes(data.get("hermes"))
    out = dict(data)
    out["hermes"] = hermes
    return out
