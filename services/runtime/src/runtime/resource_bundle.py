"""Profile bundle structure parsing (PRD FR-19)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

PROFILE_BUNDLE_FILES = (
    "profile.yaml",
    "SOUL.md",
    "skill-refs.json",
    "plugin-refs.json",
    "mcp-refs.json",
    "policy.json",
)

FORBIDDEN_BUNDLE_KEYS = frozenset(
    {
        "secret",
        "secrets",
        "apiKey",
        "api_key",
        "providerKey",
        "absolutePath",
        "localPath",
        "session",
        "memory",
    }
)


@dataclass
class ProfileBundle:
    root: Path
    profile_yaml: str | None = None
    soul_md: str | None = None
    skill_refs: list[Any] = field(default_factory=list)
    plugin_refs: list[Any] = field(default_factory=list)
    mcp_refs: list[Any] = field(default_factory=list)
    policy: dict[str, Any] = field(default_factory=dict)
    instructions_files: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "root": str(self.root),
            "hasProfileYaml": self.profile_yaml is not None,
            "hasSoul": self.soul_md is not None,
            "skillRefs": self.skill_refs,
            "pluginRefs": self.plugin_refs,
            "mcpRefs": self.mcp_refs,
            "policy": self.policy,
            "instructionsFiles": self.instructions_files,
            "warnings": self.warnings,
        }


def _load_json(path: Path) -> Any:
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _scan_forbidden(obj: Any, warnings: list[str], path: str = "") -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in FORBIDDEN_BUNDLE_KEYS:
                warnings.append(f"forbidden key '{k}' at {path or '/'}")
            _scan_forbidden(v, warnings, f"{path}/{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _scan_forbidden(v, warnings, f"{path}[{i}]")


def parse_profile_bundle(root: Path | str) -> ProfileBundle:
    root_path = Path(root)
    bundle = ProfileBundle(root=root_path)
    if not root_path.is_dir():
        bundle.warnings.append("bundle root is not a directory")
        return bundle

    py = root_path / "profile.yaml"
    if py.is_file():
        bundle.profile_yaml = py.read_text(encoding="utf-8")
    soul = root_path / "SOUL.md"
    if soul.is_file():
        bundle.soul_md = soul.read_text(encoding="utf-8")

    skill = _load_json(root_path / "skill-refs.json")
    if isinstance(skill, list):
        bundle.skill_refs = skill
    plugin = _load_json(root_path / "plugin-refs.json")
    if isinstance(plugin, list):
        bundle.plugin_refs = plugin
    mcp = _load_json(root_path / "mcp-refs.json")
    if isinstance(mcp, list):
        bundle.mcp_refs = mcp
    policy = _load_json(root_path / "policy.json")
    if isinstance(policy, dict):
        bundle.policy = policy
        _scan_forbidden(policy, bundle.warnings, "policy")

    instructions = root_path / "instructions"
    if instructions.is_dir():
        bundle.instructions_files = sorted(p.name for p in instructions.iterdir() if p.is_file())

    for name in PROFILE_BUNDLE_FILES:
        if name == "profile.yaml" and bundle.profile_yaml is None:
            bundle.warnings.append("missing profile.yaml")
    return bundle
