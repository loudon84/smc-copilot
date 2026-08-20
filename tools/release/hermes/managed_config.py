"""Compile Profile managedConfig into managed.defaults.yaml (FR-214-17)."""

from __future__ import annotations

import copy
from typing import Any

from tools.release.hermes.runtime_profile import profile_digest
from tools.release.simple_yaml import dump_yaml

MANAGED_SCHEMA = "smc.opsi.managed-config.v2"


def compile_managed_defaults(
    profile: dict[str, Any],
    *,
    profile_name: str,
) -> dict[str, Any]:
    managed = profile.get("managedConfig") or {}
    defaults = copy.deepcopy(managed.get("defaults") or {})
    enforced = copy.deepcopy(managed.get("enforced") or {})
    if not isinstance(defaults, dict) or not isinstance(enforced, dict):
        raise ValueError("managedConfig.defaults/enforced must be mappings")
    payload = {
        "schema": MANAGED_SCHEMA,
        "profile": profile_name,
        "profileVersion": int(profile.get("version") or 0),
        "profileDigest": profile_digest(profile),
        "defaults": defaults,
        "enforced": enforced,
    }
    return payload


def render_managed_defaults_yaml(
    profile: dict[str, Any],
    *,
    profile_name: str,
) -> str:
    payload = compile_managed_defaults(profile, profile_name=profile_name)
    return dump_yaml(payload)


def assert_managed_defaults_roundtrip(text: str, expected: dict[str, Any]) -> None:
    from tools.release.simple_yaml import _parse_block

    lines = text.splitlines()
    loaded, _ = _parse_block(lines, 0, 0)
    if not isinstance(loaded, dict):
        raise ValueError("managed.defaults.yaml read-back failed")
    if loaded.get("schema") != MANAGED_SCHEMA:
        raise ValueError("managed.defaults.yaml schema mismatch")
    if loaded.get("profile") != expected.get("profile"):
        raise ValueError("managed.defaults.yaml profile mismatch")
    if int(loaded.get("profileVersion") or 0) != int(expected.get("profileVersion") or 0):
        raise ValueError("managed.defaults.yaml profileVersion mismatch")
    if loaded.get("profileDigest") != expected.get("profileDigest"):
        raise ValueError("managed.defaults.yaml profileDigest mismatch")
