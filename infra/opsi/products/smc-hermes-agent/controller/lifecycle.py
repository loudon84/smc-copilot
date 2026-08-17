"""Endpoint Controller lifecycle core (v1.6). Invoked by tests and packaging."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
from base64 import urlsafe_b64decode
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

CONTROLLER_SCHEMA = "smc.opsi.endpoint-controller.v1"
STATE_SCHEMA = "smc.opsi.endpoint-controller-state.v2"
JOURNAL_SCHEMA = "smc.opsi.transaction.v2"
COMMAND_SCHEMA = "smc.opsi.user-command.v1"
RUNTIME_ACTIVE = "smc.opsi.runtime-active.v1"
PREREQUISITE_FAILED = "PREREQUISITE_FAILED"
USER_OPS = {
    "initialize-user",
    "apply-config",
    "start-gateway",
    "restart-gateway",
    "repair-l1",
    "repair-l2",
    "quiesce-gateway",
    "verify-health",
}
PHASES = (
    "controller_verified",
    "controller_installed",
    "runtime_verified",
    "runtime_staged",
    "runtime_activated",
    "user_pending",
    "user_configured",
    "gateway_healthy",
    "owner_committed",
    "finalized",
)


class PrerequisiteFailed(ValueError):
    def __init__(self, message: str, *, actual: str = "") -> None:
        detail = f"{PREREQUISITE_FAILED}: {message}"
        if actual:
            detail = f"{detail} actual={actual}"
        super().__init__(detail)
        self.actual = actual


def parse_version(text: str) -> tuple[int, int, int]:
    parts = [int(part) for part in re.findall(r"\d+", str(text or ""))]
    while len(parts) < 3:
        parts.append(0)
    return (parts[0], parts[1], parts[2])


def version_in_range(actual: str, spec: str) -> bool:
    ver = parse_version(actual)
    for raw in str(spec or "").split(","):
        clause = raw.strip()
        if clause.startswith(">="):
            if ver < parse_version(clause[2:]):
                return False
        elif clause.startswith("<="):
            if ver > parse_version(clause[2:]):
                return False
        elif clause.startswith(">"):
            if ver <= parse_version(clause[1:]):
                return False
        elif clause.startswith("<"):
            if ver >= parse_version(clause[1:]):
                return False
        elif clause.startswith("="):
            if ver != parse_version(clause.lstrip("=")):
                return False
        elif clause:
            return False
    return True


def check_python_prerequisite(*, executable: str | None, version: str, architecture: str, required: str) -> None:
    if not executable:
        raise PrerequisiteFailed("Python missing", actual="")
    arch = str(architecture or "").lower().replace("-", "_")
    if arch not in {"amd64", "x86_64", "x64"}:
        raise PrerequisiteFailed("Python architecture must be AMD64", actual=architecture)
    if not version_in_range(version, required):
        raise PrerequisiteFailed(f"Python {required}", actual=version)


def check_node_prerequisite(*, executable: str | None, version: str, required: str) -> None:
    if not executable:
        raise PrerequisiteFailed("Node missing", actual="")
    if not version_in_range(version, required):
        raise PrerequisiteFailed(f"Node {required}", actual=version)


def offline_pip_args(python: str, wheelhouse: Path, hermes_wheel: Path) -> list[str]:
    return [
        python,
        "-m",
        "pip",
        "install",
        "--no-index",
        "--find-links",
        str(wheelhouse),
        str(hermes_wheel),
    ]


def create_runtime_venv(python: str, slot: Path, runner=subprocess.run) -> Path:
    venv = slot / "venv"
    result = runner([python, "-m", "venv", str(venv)], capture_output=True, text=True, check=False)
    if getattr(result, "returncode", 1) != 0:
        raise ValueError(getattr(result, "stderr", "") or "venv creation failed")
    return venv


def venv_python(venv: Path) -> Path:
    windows = venv / "Scripts" / "python.exe"
    if windows.is_file():
        return windows
    return venv / "bin" / "python"


def install_wheelhouse_into_slot(slot: Path, *, python: str, runner=subprocess.run) -> Path:
    wheelhouse = slot / "python" / "wheels"
    wheels = sorted((slot / "app").glob("*.whl"))
    if not wheelhouse.is_dir() or not wheels:
        raise ValueError("missing python dependency")
    venv = create_runtime_venv(python, slot, runner=runner)
    py = str(venv_python(venv))
    cmd = offline_pip_args(py, wheelhouse, wheels[0])
    if any("pypi.org" in part.lower() for part in cmd):
        raise ValueError("PyPI URL forbidden")
    result = runner(cmd, capture_output=True, text=True, check=False)
    if getattr(result, "returncode", 1) != 0:
        raise ValueError(getattr(result, "stderr", "") or "offline wheel install failed")
    return venv


def gateway_smoke(cli: Path, runner=subprocess.run) -> None:
    result = runner([str(cli), "gateway", "status"], capture_output=True, text=True, check=False)
    if result.returncode not in {0, 1}:
        raise ValueError(result.stderr.strip() or "gateway smoke failed")


def canonical_json(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def iso_now() -> str:
    return datetime.now(UTC).isoformat()


def assert_contained(root: Path, relative: str) -> Path:
    text = relative.replace("/", "\\")
    parts = [part for part in text.replace("/", "\\").split("\\") if part]
    if text.startswith("\\") or text.startswith("/") or ":" in text or ".." in parts:
        raise ValueError(f"path escapes managed root: {relative}")
    if text.startswith("\\\\"):
        raise ValueError(f"UNC path forbidden: {relative}")
    resolved = (root / relative).resolve()
    root_full = root.resolve()
    if not str(resolved).lower().startswith(str(root_full).lower()):
        raise ValueError(f"path escapes managed root: {relative}")
    return resolved


def decode_config_payload(payload_b64url: str, expected_digest: str) -> dict[str, Any]:
    padding = "=" * ((4 - len(payload_b64url) % 4) % 4)
    raw = urlsafe_b64decode(payload_b64url + padding)
    body = json.loads(raw.decode("utf-8"))
    digest = sha256_bytes(canonical_json(body))
    if digest != expected_digest.lower():
        raise ValueError("config digest mismatch")
    if "keys" not in body:
        raise ValueError("config payload missing keys")
    secrets = {"api_key", "secret", "token", "password", "authorization", "bearer"}
    for key in body["keys"]:
        if str(key).lower() in secrets:
            raise ValueError("config secret key forbidden")
    return body


@dataclass
class ControllerLayout:
    root: Path

    @property
    def controller(self) -> Path:
        return self.root / "controller"

    @property
    def runtime(self) -> Path:
        return self.root / "runtime"

    @property
    def desired(self) -> Path:
        return self.root / "desired" / "machine.json"

    @property
    def observed(self) -> Path:
        return self.root / "observed" / "endpoint.json"

    @property
    def ownership(self) -> Path:
        return self.root / "state" / "ownership.json"

    @property
    def tasks(self) -> Path:
        return self.root / "state" / "tasks.json"

    @property
    def transactions(self) -> Path:
        return self.root / "transactions"

    @property
    def current_controller(self) -> Path:
        return self.controller / "current.json"

    @property
    def active_runtime(self) -> Path:
        return self.runtime / "active.json"

    def command_dir(self, sid: str, kind: str) -> Path:
        return self.root / "commands" / sid / kind


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    tmp.replace(path)


def read_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def install_controller_bundle(layout: ControllerLayout, source: Path, revision: str, digest: str = "") -> Path:
    dest_parent = layout.controller / "releases"
    dest_parent.mkdir(parents=True, exist_ok=True)
    staging = layout.controller / "staging" / os.urandom(8).hex()
    if staging.exists():
        shutil.rmtree(staging)
    shutil.copytree(source, staging)
    scripts_src = source.parent / "scripts"
    if not (staging / "scripts").exists() and scripts_src.is_dir():
        shutil.copytree(scripts_src, staging / "scripts")
    bootstrap_src = source.parent / "bootstrap"
    if not (staging / "bootstrap").exists() and bootstrap_src.is_dir():
        shutil.copytree(bootstrap_src, staging / "bootstrap")
    manifest_path = staging / "controller.manifest.json"
    if manifest_path.is_file():
        body = json.loads(manifest_path.read_text(encoding="utf-8"))
        digest = str(body.get("canonicalDigest") or "")
        if not digest:
            raise ValueError("controller canonicalDigest missing")
        expected = {str(item["path"]).replace("\\", "/") for item in body.get("files") or []}
        present = {p.relative_to(staging).as_posix() for p in staging.rglob("*") if p.is_file() and p.name != "controller.manifest.json"}
        if expected and expected - present:
            shutil.rmtree(staging)
            raise ValueError("controller manifest tamper")
        for item in body.get("files") or []:
            path = staging / item["path"]
            if not path.is_file() or sha256_file(path) != str(item["sha256"]).lower():
                shutil.rmtree(staging)
                raise ValueError("controller file digest mismatch")
    elif not digest:
        parts = []
        for path in sorted(p for p in staging.rglob("*") if p.is_file()):
            rel = path.relative_to(staging).as_posix()
            if rel == "controller.manifest.json":
                continue
            assert_contained(staging, rel)
            parts.append(f"{rel}|{path.stat().st_size}|{sha256_file(path)}")
        digest = sha256_bytes("\n".join(parts).encode("utf-8"))
    dest = dest_parent / f"{revision}-{digest[:12]}"
    if dest.exists():
        shutil.rmtree(dest)
    shutil.move(str(staging), str(dest))
    for path in dest.rglob("*"):
        if path.is_file():
            rel = path.relative_to(dest).as_posix()
            assert_contained(dest, rel)
    previous = read_json(layout.current_controller)
    pointer = {
        "schema": CONTROLLER_SCHEMA,
        "revision": revision,
        "digest": digest,
        "path": str(dest),
        "previous": (previous or {}).get("path", ""),
        "previousDigest": (previous or {}).get("digest", ""),
        "entrypoint": "Invoke-SmcEndpointController.ps1",
        "updatedAt": iso_now(),
    }
    write_json(layout.current_controller, pointer)
    return dest


def install_runtime_slot(
    layout: ControllerLayout,
    extract: Path,
    version: str,
    digest: str,
    files: list[dict[str, str]],
    *,
    install_type: str = "binary-zip",
    runtime_entrypoint: str = "",
    requires: dict[str, str] | None = None,
    python_exe: str | None = None,
    python_version: str = "",
    python_arch: str = "amd64",
    node_exe: str | None = None,
    node_version: str = "",
    runner=subprocess.run,
) -> Path:
    previous = read_json(layout.active_runtime)
    slot = layout.runtime / "versions" / f"{version}-{digest[:12]}"
    if slot.exists():
        shutil.rmtree(slot)
    shutil.copytree(extract, slot)
    present = {p.relative_to(slot).as_posix() for p in slot.rglob("*") if p.is_file()}
    expected = {item["path"].replace("\\", "/") for item in files}
    extra = present - expected
    missing = expected - present
    if extra or missing:
        raise ValueError(f"runtime file list mismatch extra={sorted(extra)} missing={sorted(missing)}")
    for item in files:
        path = assert_contained(slot, item["path"])
        actual = sha256_file(path)
        if actual != item["sha256"].lower():
            raise ValueError(f"runtime file digest mismatch: {item['path']}")
        if path.stat().st_size != int(item["size"]):
            raise ValueError(f"runtime file size mismatch: {item['path']}")
    entry = runtime_entrypoint or next(
        (item["path"] for item in files if str(item["path"]).endswith("hermes.exe")),
        "hermes.exe",
    )
    if install_type == "python-wheelhouse":
        req = requires or {}
        check_python_prerequisite(
            executable=python_exe,
            version=python_version,
            architecture=python_arch,
            required=str(req.get("python") or ">=3.12,<3.13"),
        )
        check_node_prerequisite(
            executable=node_exe,
            version=node_version,
            required=str(req.get("node") or ">=22,<23"),
        )
        if python_exe:
            install_wheelhouse_into_slot(slot, python=python_exe, runner=runner)
        entry = runtime_entrypoint or "venv/Scripts/hermes.exe"
        write_json(
            slot / "runtime.json",
            {
                "version": version,
                "digest": digest,
                "installType": install_type,
                "entrypoint": entry,
            },
        )
        cli = assert_contained(slot, entry)
        if cli.is_file():
            result = runner([str(cli), "--version"], capture_output=True, text=True, check=False)
            if result.returncode != 0 or version not in (result.stdout or ""):
                raise ValueError(f"CLI version mismatch: expected {version}")
            gateway_smoke(cli, runner=runner)
    pointer = {
        "schema": RUNTIME_ACTIVE,
        "active": str(slot),
        "previous": (previous or {}).get("active", ""),
        "version": version,
        "digest": digest,
        "manifestDigest": digest,
        "entrypoint": entry,
        "updatedAt": iso_now(),
    }
    write_json(layout.active_runtime, pointer)
    return slot


def resolve_active_cli(layout: ControllerLayout, entrypoint: str) -> Path:
    active = read_json(layout.active_runtime)
    if not active or not active.get("active"):
        raise FileNotFoundError("runtime active pointer missing")
    slot = Path(str(active["active"]))
    cli = assert_contained(slot, entrypoint)
    if not cli.is_file():
        raise FileNotFoundError(f"managed CLI missing: {entrypoint}")
    return cli


def journal_path(layout: ControllerLayout, request_id: str) -> Path:
    return layout.transactions / f"{request_id}.json"


def start_journal(
    layout: ControllerLayout,
    *,
    request_id: str,
    digest: str,
    operation: str,
    previous_owner: str,
    previous_version: str,
) -> dict[str, Any]:
    layout.transactions.mkdir(parents=True, exist_ok=True)
    path = journal_path(layout, request_id)
    existing = read_json(path)
    if existing:
        if existing.get("desiredDigest") != digest:
            raise ValueError("journal digest conflict")
        return existing
    for other in layout.transactions.glob("*.json"):
        body = read_json(other)
        if body and body.get("phase") not in {"finalized", "rolled_back"}:
            if body.get("requestId") != request_id:
                raise ValueError("open mutation blocks new journal")
    journal = {
        "schema": JOURNAL_SCHEMA,
        "requestId": request_id,
        "desiredDigest": digest,
        "operation": operation,
        "phase": "controller_verified",
        "attempt": 1,
        "previousOwner": previous_owner,
        "previousVersion": previous_version,
        "checkpoints": ["controller_verified"],
        "startedAt": iso_now(),
        "deadline": "",
        "recovery": "resume_or_rollback",
    }
    write_json(path, journal)
    return journal


def checkpoint_journal(layout: ControllerLayout, request_id: str, phase: str, output_digest: str = "") -> dict[str, Any]:
    path = journal_path(layout, request_id)
    journal = read_json(path)
    if journal is None:
        raise FileNotFoundError("journal missing")
    if phase not in PHASES:
        raise ValueError(f"unknown phase {phase}")
    journal["phase"] = phase
    journal["outputDigest"] = output_digest
    journal.setdefault("checkpoints", []).append(phase)
    journal["updatedAt"] = iso_now()
    write_json(path, journal)
    return journal


def resume_or_rollback(layout: ControllerLayout, request_id: str) -> dict[str, Any]:
    journal = read_json(journal_path(layout, request_id))
    if journal is None:
        raise FileNotFoundError("journal missing")
    phase = journal.get("phase")
    if phase in {"finalized", "rolled_back"}:
        return journal
    verified = set(journal.get("checkpoints") or [])
    if "owner_committed" in verified or "gateway_healthy" in verified:
        journal["phase"] = "resumed"
        write_json(journal_path(layout, request_id), journal)
        return journal
    if "runtime_activated" in verified or "controller_installed" in verified:
        journal["phase"] = "recovering"
        write_json(journal_path(layout, request_id), journal)
        return journal
    journal["phase"] = "rolled_back"
    write_json(journal_path(layout, request_id), journal)
    return journal


def write_ownership(layout: ControllerLayout, *, current: str, previous: str, pending: str, revision: int) -> None:
    write_json(
        layout.ownership,
        {
            "previous": previous,
            "current": current,
            "pending": pending,
            "revision": revision,
            "updatedAt": iso_now(),
        },
    )


def commit_owner(layout: ControllerLayout, *, ready: bool) -> dict[str, Any]:
    record = read_json(layout.ownership) or {"previous": "", "current": "", "pending": "opsi", "revision": 0}
    if not ready:
        raise ValueError("owner commit requires READY")
    previous = record.get("current") or record.get("previous") or ""
    write_ownership(layout, current="opsi", previous=previous, pending="", revision=int(record.get("revision") or 0) + 1)
    owner_file = layout.root.parent / "control-owner.json"
    write_json(owner_file, {"hermes": "opsi"})
    return read_json(layout.ownership) or {}


def restore_previous_owner(layout: ControllerLayout) -> None:
    record = read_json(layout.ownership) or {}
    previous = str(record.get("previous") or "")
    owner_file = layout.root.parent / "control-owner.json"
    if previous:
        write_json(owner_file, {"hermes": previous})
        write_ownership(layout, current=previous, previous="", pending="", revision=int(record.get("revision") or 0) + 1)
    elif owner_file.exists():
        owner_file.unlink()
        write_ownership(layout, current="", previous="", pending="", revision=int(record.get("revision") or 0) + 1)


def enqueue_user_command(layout: ControllerLayout, sid: str, command: dict[str, Any]) -> Path:
    if command.get("operation") not in USER_OPS:
        raise ValueError("operation not allowlisted for user controller")
    inbox = layout.command_dir(sid, "inbox")
    inbox.mkdir(parents=True, exist_ok=True)
    path = inbox / f"{command['requestId']}.json"
    body = dict(command)
    body["schema"] = COMMAND_SCHEMA
    write_json(path, body)
    return path


def complete_user_command(layout: ControllerLayout, sid: str, request_id: str, digest: str) -> Path:
    inbox = layout.command_dir(sid, "inbox") / f"{request_id}.json"
    if not inbox.is_file():
        outbox = layout.command_dir(sid, "outbox") / f"{request_id}.json"
        if outbox.is_file():
            return outbox
        raise FileNotFoundError("inbox command missing")
    command = read_json(inbox) or {}
    if command.get("desiredDigest") != digest:
        quarantine = layout.root / "quarantine" / sid
        quarantine.mkdir(parents=True, exist_ok=True)
        shutil.move(str(inbox), str(quarantine / f"{request_id}.json"))
        raise ValueError("command digest tamper")
    outbox_dir = layout.command_dir(sid, "outbox")
    outbox_dir.mkdir(parents=True, exist_ok=True)
    outbox = outbox_dir / f"{request_id}.json"
    write_json(outbox, {**command, "status": "SUCCEEDED", "observedDigest": digest, "completedAt": iso_now()})
    inbox.unlink()
    return outbox


def ack_result(layout: ControllerLayout, sid: str, request_id: str, token: str) -> None:
    outbox = layout.command_dir(sid, "outbox") / f"{request_id}.json"
    if not outbox.is_file():
        return
    ack_dir = layout.command_dir(sid, "ack")
    ack_dir.mkdir(parents=True, exist_ok=True)
    body = read_json(outbox) or {}
    body["ackToken"] = token
    write_json(ack_dir / f"{request_id}.json", body)
    outbox.unlink()


def build_state_v2(layout: ControllerLayout, client_id: str) -> dict[str, Any]:
    owner = read_json(layout.ownership) or {}
    journal = None
    open_tx = []
    if layout.transactions.exists():
        for path in layout.transactions.glob("*.json"):
            body = read_json(path)
            if body:
                open_tx.append(body)
                journal = body
    controller = read_json(layout.current_controller) or {}
    runtime = read_json(layout.active_runtime) or {}
    current_owner = str(owner.get("current") or "")
    health = "UNKNOWN"
    if current_owner == "opsi" and controller.get("path") and runtime.get("active"):
        if journal and journal.get("phase") == "finalized":
            health = "HEALTHY"
    elif journal and journal.get("phase") in {"user_pending", "recovering"}:
        health = "WARNING"
    return {
        "schema": STATE_SCHEMA,
        "clientId": client_id,
        "owner": current_owner,
        "health": health,
        "controller": {"revision": controller.get("revision", ""), "digest": controller.get("digest", "")},
        "runtime": {"version": runtime.get("version", ""), "digest": runtime.get("digest", "")},
        "transaction": {"phase": (journal or {}).get("phase", ""), "open": bool(open_tx)},
        "timestamp": iso_now(),
    }


def two_phase_uninstall(layout: ControllerLayout, *, user_online: bool, residual: bool = False) -> str:
    if residual:
        return "UNINSTALL_BLOCKED"
    restore_previous_owner(layout)
    for rel in ("controller", "runtime", "desired", "observed", "transactions", "commands"):
        path = layout.root / rel
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)
    tombstone = layout.root / "results" / "uninstall-tombstone.json"
    write_json(tombstone, {"status": "SUCCEEDED", "userOnline": user_online, "retainedUserData": True})
    return "SUCCEEDED"


def fake_programdata(root: Path) -> ControllerLayout:
    os.environ["SMC_OPSI_ROOT"] = str(root)
    root.mkdir(parents=True, exist_ok=True)
    return ControllerLayout(root)
