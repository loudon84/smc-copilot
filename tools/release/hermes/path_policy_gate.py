"""Static gate: Hermes Windows production must not mutate persistent Machine/User PATH."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
HERMES_WINDOWS = ROOT / "infra" / "windows" / "hermes-agent"

# Production source only — tests and future migration tools are allowlisted.
ALLOWLIST_DIR_PARTS = {
    ("tests",),
    ("migration",),
    ("forensic",),
}

SCAN_SUFFIXES = {".ps1", ".psm1", ".psd1", ".wxs", ".wxi", ".xml", ".cs", ".bat", ".cmd"}

# Persistent Machine/User PATH writers (case-insensitive, multiline-tolerant).
FORBIDDEN_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "SetEnvironmentVariable PATH Machine/User",
        re.compile(
            r"""SetEnvironmentVariable\s*\(\s*["']Path["']\s*,.*?["'](?:Machine|User)["']""",
            re.IGNORECASE | re.DOTALL,
        ),
    ),
    (
        "EnvironmentVariableTarget PATH Machine/User",
        re.compile(
            r"""EnvironmentVariableTarget\s*::\s*(?:Machine|User).*?["']Path["']"""
            r"""|["']Path["'].*?EnvironmentVariableTarget\s*::\s*(?:Machine|User)""",
            re.IGNORECASE | re.DOTALL,
        ),
    ),
    (
        "setx PATH",
        re.compile(r"""\bsetx\s+(?:/M\s+)?["']?Path["']?""", re.IGNORECASE),
    ),
    (
        "HKCU Environment Path write",
        re.compile(
            r"""HKCU:\\Environment["']?[^\n]{0,120}\bPath\b"""
            r"""|Set-ItemProperty[^\n]{0,160}HKCU:\\Environment[^\n]{0,80}\bPath\b""",
            re.IGNORECASE,
        ),
    ),
    (
        "Session Manager Environment Path write",
        re.compile(
            r"""Session\s+Manager\\Environment[^\n]{0,120}\bPath\b"""
            r"""|Set-ItemProperty[^\n]{0,200}Session\s+Manager\\Environment[^\n]{0,80}\bPath\b""",
            re.IGNORECASE,
        ),
    ),
    (
        "WiX Environment PATH",
        re.compile(
            r"""<\s*Environment\b[^>]*\bName\s*=\s*["']PATH["']""",
            re.IGNORECASE | re.DOTALL,
        ),
    ),
    (
        "Add/Remove-SmcMachinePath production API",
        re.compile(r"""\b(?:Add|Remove)-SmcMachinePath\b"""),
    ),
]

WIX_PATH_ENV = re.compile(
    r"""<\s*Environment\b[^>]*\bName\s*=\s*["']PATH["']""",
    re.IGNORECASE | re.DOTALL,
)


def _is_allowlisted(rel: Path) -> bool:
    parts = tuple(part.lower() for part in rel.parts)
    for allow in ALLOWLIST_DIR_PARTS:
        if len(parts) >= len(allow) and parts[: len(allow)] == allow:
            return True
        # allow .../tests/... anywhere under hermes-agent
        if allow[0] in parts:
            return True
    return False


def _iter_scan_files(root: Path) -> list[Path]:
    files: list[Path] = []
    if not root.is_dir():
        return files
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in SCAN_SUFFIXES:
            continue
        rel = path.relative_to(root)
        if _is_allowlisted(rel):
            continue
        files.append(path)
    return files


def scan_persistent_path_mutations(root: Path | None = None) -> list[str]:
    """Return human-readable hits; empty list means PASS."""
    base = root or HERMES_WINDOWS
    hits: list[str] = []
    for path in _iter_scan_files(base):
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        # Normalize newlines for multiline patterns.
        normalized = text.replace("\r\n", "\n").replace("\r", "\n")
        for label, pattern in FORBIDDEN_PATTERNS:
            if pattern.search(normalized):
                rel = path.relative_to(base) if base in path.parents or path == base else path
                hits.append(f"{label}: {rel.as_posix()}")
    return hits


def assert_no_persistent_path_mutations(root: Path | None = None) -> None:
    hits = scan_persistent_path_mutations(root)
    if hits:
        joined = "; ".join(hits[:12])
        raise ValueError(f"PERSISTENT_PATH_MUTATION_FORBIDDEN: {joined}")


def assert_wix_no_path_environment(root: Path | None = None) -> None:
    base = root or HERMES_WINDOWS
    wix_files = list(base.rglob("*.wxs")) + list(base.rglob("*.wxi"))
    hits: list[str] = []
    for path in wix_files:
        rel = path.relative_to(base)
        if _is_allowlisted(rel):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if WIX_PATH_ENV.search(text):
            hits.append(rel.as_posix())
    if hits:
        raise ValueError(
            "PERSISTENT_PATH_MUTATION_FORBIDDEN: WiX Environment PATH in "
            + ", ".join(hits)
        )


def path_policy_payload() -> dict[str, Any]:
    return {"path": {"policy": "immutable"}}


def assert_path_policy_metadata(build: dict[str, Any]) -> None:
    env = build.get("environment")
    if not isinstance(env, dict):
        raise ValueError("environment.path.policy missing (environment block)")
    path = env.get("path")
    if not isinstance(path, dict):
        raise ValueError("environment.path.policy missing (path block)")
    if path.get("policy") != "immutable":
        raise ValueError("environment.path.policy must be immutable")


def assert_hermes_path_policy(root: Path | None = None) -> None:
    """Full static + WiX gate used by release verification."""
    assert_no_persistent_path_mutations(root)
    assert_wix_no_path_environment(root)
