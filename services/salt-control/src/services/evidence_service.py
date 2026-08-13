"""Evidence bundle generator — implemented/not_proven only (v2.4.1)."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

FORBIDDEN_PROVEN = frozenset({"proven"})


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_json(path: Path, payload: dict[str, Any]) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    status = str(payload.get("status", "not_proven"))
    if status in FORBIDDEN_PROVEN and not payload.get("signer"):
        raise ValueError("proven status requires authorized signer")
    raw = json.dumps(payload, indent=2, sort_keys=True, default=str) + "\n"
    path.write_text(raw, encoding="utf-8")
    return _sha256(raw.encode("utf-8"))


def generate_bundle(
    *,
    root: Path,
    rollout_id: str,
    git_commit: str | None,
    snapshot_digest: str | None,
    release_id: str | None,
    config_revision: str | None,
    files: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    captured = datetime.now(UTC).date().isoformat()
    out_dir = root / "docs" / "salt" / "evidence" / "v2.4.1" / "ring0" / rollout_id / captured
    digests: dict[str, str] = {}
    for name, payload in files.items():
        payload = dict(payload)
        payload.setdefault("schema", f"smc.salt-evidence.v241.{name}.v1")
        payload.setdefault("source", "generator")
        payload.setdefault("capturedAt", datetime.now(UTC).isoformat())
        payload.setdefault("status", "not_proven")
        if payload.get("status") == "proven" and not payload.get("signer"):
            payload["status"] = "not_proven"
        digests[f"{name}.json"] = write_json(out_dir / f"{name}.json", payload)
    manifest = {
        "schema": "smc.salt-evidence.v241.manifest.v1",
        "status": "not_proven",
        "source": "generator",
        "generatorVersion": "v2.4.1",
        "gitCommit": git_commit,
        "snapshotDigest": snapshot_digest,
        "releaseId": release_id,
        "configRevision": config_revision,
        "capturedAt": datetime.now(UTC).isoformat(),
        "files": [{"name": k, "sha256": v} for k, v in sorted(digests.items())],
    }
    digests["manifest.json"] = write_json(out_dir / "manifest.json", manifest)
    manifest["digest"] = _sha256(json.dumps(manifest, sort_keys=True).encode("utf-8"))
    write_json(out_dir / "manifest.json", manifest)
    return {"path": str(out_dir), "manifestDigest": digests["manifest.json"], "status": "not_proven"}
