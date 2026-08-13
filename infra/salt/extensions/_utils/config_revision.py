"""Salt __utils__ name: config_revision.* — config snapshots, validate, apply, rollback.

Standalone Salt loader plugin. No relative imports, no _utils package.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def atomic_write_text(path: Path, content: str, encoding: str = "utf-8") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding=encoding, newline="\n") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, path)
    except Exception:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
        raise


try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None  # type: ignore[assignment]


def snapshot_dir(hermes_home: Path) -> Path:
    return hermes_home / "salt-snapshots"


def revision_id(content: str) -> str:
    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()[:12]
    stamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    return f"{stamp}-{digest}"


def dump_config(data: dict[str, Any]) -> str:
    if yaml is not None:
        return yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    return json.dumps(data, indent=2, ensure_ascii=False)


def load_config(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    text = path.read_text(encoding="utf-8")
    if yaml is not None:
        loaded = yaml.safe_load(text) or {}
        if isinstance(loaded, dict):
            return loaded
        return {}
    loaded = json.loads(text)
    return loaded if isinstance(loaded, dict) else {}


def validate_config(data: dict[str, Any]) -> tuple[bool, str]:
    if not isinstance(data, dict):
        return False, "config must be a mapping"
    if "platforms" in data and not isinstance(data["platforms"], dict):
        return False, "platforms must be a mapping"
    return True, "ok"


def save_snapshot(hermes_home: Path, content: str, note: str = "") -> dict[str, Any]:
    rev = revision_id(content)
    directory = snapshot_dir(hermes_home)
    directory.mkdir(parents=True, exist_ok=True)
    payload = {
        "revision": rev,
        "note": note,
        "created_at": datetime.now(UTC).isoformat(),
        "content": content,
    }
    target = directory / f"{rev}.json"
    atomic_write_text(target, json.dumps(payload, indent=2) + "\n")
    latest = directory / "latest.json"
    atomic_write_text(latest, json.dumps({"revision": rev}, indent=2) + "\n")
    return payload


def list_snapshots(hermes_home: Path) -> list[str]:
    directory = snapshot_dir(hermes_home)
    if not directory.is_dir():
        return []
    return sorted(p.stem for p in directory.glob("*.json") if p.name != "latest.json")


def load_snapshot(hermes_home: Path, revision: str) -> dict[str, Any] | None:
    target = snapshot_dir(hermes_home) / f"{revision}.json"
    if not target.is_file():
        return None
    return json.loads(target.read_text(encoding="utf-8"))


def apply_config(hermes_home: Path, data: dict[str, Any], note: str = "") -> dict[str, Any]:
    ok, message = validate_config(data)
    if not ok:
        return {"ok": False, "error": "invalid_config", "message": message}
    layout_config = hermes_home / "config.yaml"
    previous = layout_config.read_text(encoding="utf-8") if layout_config.is_file() else ""
    if previous:
        save_snapshot(hermes_home, previous, note="pre-apply")
    content = dump_config(data)
    atomic_write_text(layout_config, content)
    snapshot = save_snapshot(hermes_home, content, note=note or "apply")
    return {"ok": True, "revision": snapshot["revision"], "path": str(layout_config)}


def rollback_config(hermes_home: Path, revision: str) -> dict[str, Any]:
    snapshot = load_snapshot(hermes_home, revision)
    if not snapshot:
        return {"ok": False, "error": "snapshot_missing", "revision": revision}
    content = str(snapshot.get("content") or "")
    atomic_write_text(hermes_home / "config.yaml", content)
    return {"ok": True, "revision": revision}
