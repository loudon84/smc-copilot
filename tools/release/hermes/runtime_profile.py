"""Runtime profile load/resolve. Only declared packages enter the release."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from tools.release.simple_yaml import load_yaml

SCHEMA = "smc.hermes.runtime-profile.v1"
FORBIDDEN_NODE_VERSIONS = {"latest", "current", "*", "unversioned"}


def load_profiles(path: Path) -> dict[str, Any]:
    data = load_yaml(path)
    if not isinstance(data, dict) or data.get("schema") != SCHEMA:
        raise ValueError(f"invalid runtime profile schema in {path}")
    profiles = data.get("profiles")
    if not isinstance(profiles, dict) or not profiles:
        raise ValueError("runtime profiles missing")
    for name, profile in profiles.items():
        validate_profile(name, profile)
    return data


def resolve_profile(data: dict[str, Any], name: str) -> dict[str, Any]:
    profiles = data.get("profiles") or {}
    if name not in profiles:
        raise ValueError(f"runtime profile not defined: {name}")
    profile = profiles[name]
    validate_profile(name, profile)
    return profile


def validate_profile(name: str, profile: dict[str, Any]) -> None:
    if not isinstance(profile, dict):
        raise ValueError(f"invalid profile: {name}")
    if int(profile.get("version") or 0) < 1:
        raise ValueError(f"profile version missing: {name}")
    python = profile.get("python") or {}
    extras = python.get("extras")
    if not isinstance(extras, list) or not extras:
        raise ValueError(f"python extras missing: {name}")
    lazy = (python.get("lazyInstall") or {}).get("allowed")
    if lazy is True:
        raise ValueError(f"lazy python install forbidden: {name}")
    node = profile.get("node") or {}
    packages = node.get("packages")
    if not isinstance(packages, list):
        raise ValueError(f"node packages missing: {name}")
    for item in packages:
        pkg_name = str((item or {}).get("name") or "")
        version = str((item or {}).get("version") or "")
        if not pkg_name:
            raise ValueError(f"node package name missing: {name}")
        if not version or version.lower() in FORBIDDEN_NODE_VERSIONS:
            raise ValueError(f"node package version not pinned: {pkg_name}")
    gateway = profile.get("gateway") or {}
    if gateway.get("bind") not in (None, "127.0.0.1"):
        raise ValueError(f"gateway bind must be 127.0.0.1: {name}")
