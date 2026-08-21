#!/usr/bin/env python3
"""Managed Config Apply Tool (PRD-OPSI-v2.1.6 FR-216-08 / FR-216-09 / FR-216-10).

Offline, self-contained: reads existing config.yaml + managed.defaults.yaml,
deep-merges with protected-key semantics, safe_dumps via PyYAML, atomic promote,
and validates with an independent standard parse. No Registry/network/secret access.
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import sys
from pathlib import Path
from typing import Any

EXIT_OK = 0
EXIT_YAML_PARSE = 10
EXIT_MANAGED_MERGE = 11
EXIT_ROLLBACK = 12
EXIT_USAGE = 2

MANAGED_SCHEMA = "smc.opsi.managed-config.v2"
PROTECTED_KEYS = frozenset(
    {
        "model",
        "models",
        "provider",
        "providers",
        "auxiliary",
        "delegation",
        "API_SERVER_KEY",
        "api_server_key",
    }
)

# Keep import of yaml local to fail with structured JSON when missing.
def _import_yaml():
    try:
        import yaml  # noqa: PLC0415
    except ImportError as exc:
        _emit({"ok": False, "errorCode": "CONFIG_YAML_PARSE_FAILED", "detail": "pyyaml missing"}, file=sys.stderr)
        raise SystemExit(EXIT_YAML_PARSE) from exc
    return yaml


def _emit(payload: dict[str, Any], *, file=sys.stdout) -> None:
    print(json.dumps(payload, ensure_ascii=True, sort_keys=True), file=file)


def _safe_load(yaml_mod, text: str, *, path: str) -> Any:
    try:
        return yaml_mod.safe_load(text) if text.strip() else {}
    except yaml_mod.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        detail = {
            "ok": False,
            "errorCode": "CONFIG_YAML_PARSE_FAILED",
            "stage": "standard_parse",
            "configPath": path,
            "parserSource": "pyyaml.safe_load",
            "detail": str(exc).split("\n")[0][:200],
        }
        if mark is not None:
            detail["line"] = int(mark.line) + 1
            detail["column"] = int(mark.column) + 1
        _emit(detail, file=sys.stderr)
        raise SystemExit(EXIT_YAML_PARSE) from exc


def _safe_dump(yaml_mod, payload: Any) -> str:
    text = yaml_mod.safe_dump(
        payload,
        allow_unicode=True,
        sort_keys=True,
        default_flow_style=False,
        width=10_000,
    )
    if not text.endswith("\n"):
        text += "\n"
    return text.replace("\r\n", "\n").replace("\r", "\n")


def _deep_merge(base: Any, overlay: Any, *, conflict: str) -> Any:
    """Merge mappings. conflict=PreferOverlay means overlay wins on leaf conflict."""
    if not isinstance(base, dict):
        base = {}
    if not isinstance(overlay, dict):
        return copy.deepcopy(base) if conflict == "PreferBase" else copy.deepcopy(overlay)
    result: dict[str, Any] = copy.deepcopy(base)
    for key, value in overlay.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value, conflict=conflict)
        elif key in result and conflict == "PreferBase":
            continue
        else:
            result[key] = copy.deepcopy(value)
    return result


def _assert_no_protected_in_managed(section: dict[str, Any], *, label: str) -> None:
    for key in section.keys():
        if str(key) in PROTECTED_KEYS:
            _emit(
                {
                    "ok": False,
                    "errorCode": "CONFIG_MANAGED_MERGE_FAILED",
                    "stage": "protected_key_guard",
                    "detail": f"managed {label} must not contain instance/secret key: {key}",
                },
                file=sys.stderr,
            )
            raise SystemExit(EXIT_MANAGED_MERGE)


def merge_managed_config(
    *,
    existing: dict[str, Any],
    defaults: dict[str, Any],
    enforced: dict[str, Any],
    workspace_root: str | None = None,
) -> dict[str, Any]:
    """defaults: existing wins; enforced: enterprise wins; protect instance keys."""
    _assert_no_protected_in_managed(defaults, label="defaults")
    _assert_no_protected_in_managed(enforced, label="enforced")

    preserved: dict[str, Any] = {}
    for key in PROTECTED_KEYS:
        if key in existing:
            preserved[key] = copy.deepcopy(existing[key])

    # defaults: existing value wins → PreferOverlay on existing over defaults
    merged = _deep_merge(defaults, existing, conflict="PreferOverlay")
    # enforced: enterprise value wins → PreferOverlay on enforced over merged
    merged = _deep_merge(merged, enforced, conflict="PreferOverlay")
    for key, value in preserved.items():
        merged[key] = value

    if workspace_root:
        terminal = merged.get("terminal")
        if not isinstance(terminal, dict):
            terminal = {}
            merged["terminal"] = terminal
        terminal["cwd"] = workspace_root
    return merged


def validate_config_file(config_path: Path) -> dict[str, Any]:
    """Independent PyYAML oracle for an existing config.yaml (FR-216-05 / FR-216-11)."""
    yaml_mod = _import_yaml()
    if not config_path.is_file():
        _emit(
            {
                "ok": False,
                "errorCode": "CONFIG_YAML_PARSE_FAILED",
                "stage": "config_exists",
                "configPath": str(config_path),
                "detail": "config.yaml missing",
            },
            file=sys.stderr,
        )
        raise SystemExit(EXIT_YAML_PARSE)
    text = config_path.read_text(encoding="utf-8")
    loaded = _safe_load(yaml_mod, text, path=str(config_path))
    if not isinstance(loaded, dict):
        _emit(
            {
                "ok": False,
                "errorCode": "CONFIG_YAML_PARSE_FAILED",
                "stage": "standard_parse",
                "configPath": str(config_path),
                "parserSource": "pyyaml.safe_load",
                "detail": "root is not a mapping",
            },
            file=sys.stderr,
        )
        raise SystemExit(EXIT_YAML_PARSE)
    return {
        "ok": True,
        "standardYaml": "PASS",
        "configPath": str(config_path),
        "written": False,
    }


def apply_config(
    *,
    config_path: Path,
    managed_defaults_path: Path,
    workspace_root: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    yaml_mod = _import_yaml()

    if not managed_defaults_path.is_file():
        _emit(
            {
                "ok": False,
                "errorCode": "CONFIG_MANAGED_MERGE_FAILED",
                "stage": "read_managed_defaults",
                "detail": f"managed.defaults.yaml missing: {managed_defaults_path}",
            },
            file=sys.stderr,
        )
        raise SystemExit(EXIT_MANAGED_MERGE)

    managed_text = managed_defaults_path.read_text(encoding="utf-8")
    managed = _safe_load(yaml_mod, managed_text, path=str(managed_defaults_path))
    if not isinstance(managed, dict):
        _emit(
            {
                "ok": False,
                "errorCode": "CONFIG_MANAGED_MERGE_FAILED",
                "stage": "managed_schema",
                "detail": "managed.defaults.yaml root is not a mapping",
            },
            file=sys.stderr,
        )
        raise SystemExit(EXIT_MANAGED_MERGE)
    if str(managed.get("schema") or "") != MANAGED_SCHEMA:
        _emit(
            {
                "ok": False,
                "errorCode": "CONFIG_MANAGED_MERGE_FAILED",
                "stage": "managed_schema",
                "detail": "unsupported managed.defaults schema",
            },
            file=sys.stderr,
        )
        raise SystemExit(EXIT_MANAGED_MERGE)

    defaults = managed.get("defaults") or {}
    enforced = managed.get("enforced") or {}
    if not isinstance(defaults, dict) or not isinstance(enforced, dict):
        _emit(
            {
                "ok": False,
                "errorCode": "CONFIG_MANAGED_MERGE_FAILED",
                "stage": "managed_schema",
                "detail": "defaults/enforced must be mappings",
            },
            file=sys.stderr,
        )
        raise SystemExit(EXIT_MANAGED_MERGE)

    had_file = config_path.is_file()
    existing_text = config_path.read_text(encoding="utf-8") if had_file else ""
    existing_raw = _safe_load(yaml_mod, existing_text, path=str(config_path))
    existing = existing_raw if isinstance(existing_raw, dict) else {}

    merged = merge_managed_config(
        existing=existing,
        defaults=defaults,
        enforced=enforced,
        workspace_root=workspace_root,
    )
    new_text = _safe_dump(yaml_mod, merged)

    # Independent read-back before any promote.
    reloaded = _safe_load(yaml_mod, new_text, path=f"{config_path}.tmp.smc")
    if reloaded != merged:
        _emit(
            {
                "ok": False,
                "errorCode": "CONFIG_YAML_PARSE_FAILED",
                "stage": "candidate_semantic",
                "detail": "candidate dump/load semantic mismatch",
            },
            file=sys.stderr,
        )
        raise SystemExit(EXIT_YAML_PARSE)

    unchanged = had_file and existing_text.replace("\r\n", "\n") == new_text
    result = {
        "ok": True,
        "changed": not unchanged,
        "configPath": str(config_path),
        "profile": str(managed.get("profile") or ""),
        "profileVersion": int(managed.get("profileVersion") or 0),
        "profileDigest": str(managed.get("profileDigest") or ""),
        "standardYaml": "PASS",
    }

    if dry_run or unchanged:
        # Unchanged still means structural validation already passed.
        result["written"] = False
        return result

    config_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(str(config_path) + ".tmp.smc")
    backup = Path(str(config_path) + ".bak.smc")
    try:
        tmp.write_text(new_text, encoding="utf-8", newline="\n")
        # Re-parse tmp on disk before promote.
        tmp_loaded = _safe_load(yaml_mod, tmp.read_text(encoding="utf-8"), path=str(tmp))
        if tmp_loaded != merged:
            raise ValueError("tmp semantic mismatch")
        if had_file:
            # Atomic-ish backup then promote.
            if backup.exists():
                backup.unlink()
            os.replace(config_path, backup)
        os.replace(tmp, config_path)
        if backup.exists():
            backup.unlink()
    except Exception as exc:  # noqa: BLE001 — map to structured rollback failure
        try:
            if tmp.exists():
                tmp.unlink()
            if had_file and backup.exists() and not config_path.exists():
                os.replace(backup, config_path)
            elif had_file and backup.exists() and config_path.exists():
                # Leave backup for evidence if restore path unclear.
                pass
        except OSError as restore_exc:
            _emit(
                {
                    "ok": False,
                    "errorCode": "CONFIG_ROLLBACK_FAILED",
                    "stage": "atomic_promote",
                    "detail": f"rollback failed: {restore_exc}",
                },
                file=sys.stderr,
            )
            raise SystemExit(EXIT_ROLLBACK) from restore_exc
        _emit(
            {
                "ok": False,
                "errorCode": "CONFIG_MANAGED_MERGE_FAILED",
                "stage": "atomic_promote",
                "detail": str(exc)[:200],
            },
            file=sys.stderr,
        )
        raise SystemExit(EXIT_MANAGED_MERGE) from exc

    result["written"] = True
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="SMC Hermes managed config apply (offline)")
    parser.add_argument("--config", required=True, type=Path, help="Path to config.yaml")
    parser.add_argument(
        "--managed-defaults",
        type=Path,
        default=None,
        help="Path to managed.defaults.yaml (required unless --validate-only)",
    )
    parser.add_argument("--workspace-root", default="", help="Force terminal.cwd to this path")
    parser.add_argument("--dry-run", action="store_true", help="Validate merge without writing")
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Parse config.yaml with PyYAML; do not merge or write",
    )
    args = parser.parse_args(argv)

    try:
        if args.validate_only:
            result = validate_config_file(args.config)
        else:
            if args.managed_defaults is None:
                parser.error("--managed-defaults is required unless --validate-only")
            workspace = args.workspace_root.strip() or None
            result = apply_config(
                config_path=args.config,
                managed_defaults_path=args.managed_defaults,
                workspace_root=workspace,
                dry_run=bool(args.dry_run),
            )
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else EXIT_MANAGED_MERGE
    _emit(result)
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
