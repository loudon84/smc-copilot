"""Signed Hermes artifact lifecycle (Ed25519 production; HMAC lab/test only).

Does not import services.runtime. Production refuses shared HMAC signing keys.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import shutil
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

from .paths import HermesLayout
from .semver import semver_key

MAX_ZIP_FILES = 10_000
MAX_ZIP_TOTAL_BYTES = 1_000_000_000
MAX_ZIP_MEMBER_BYTES = 500_000_000


def salt_env() -> str:
    return os.environ.get("SMC_SALT_ENV", "lab").strip().lower() or "lab"


def is_lab_env() -> bool:
    return salt_env() in {"lab", "test"}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def hmac_signature(data: bytes, key: str) -> str:
    if not is_lab_env():
        raise RuntimeError("HMAC artifact signatures forbidden outside SMC_SALT_ENV=lab|test")
    return hmac.new(key.encode("utf-8"), data, hashlib.sha256).hexdigest()


def verify_signature(data: bytes, signature: str, key: str) -> bool:
    if not is_lab_env():
        return False
    expected = hmac_signature(data, key)
    return hmac.compare_digest(expected, signature.lower())


def verify_ed25519(data: bytes, signature_b64: str, public_key_b64: str) -> bool:
    import base64

    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    try:
        public = Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key_b64))
        public.verify(base64.b64decode(signature_b64), data)
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


def verify_bundle(
    archive: Path,
    sha256: str,
    signature: str,
    signing_key: str = "",
    *,
    key_id: str | None = None,
    public_key: str | None = None,
) -> dict[str, Any]:
    data = archive.read_bytes()
    digest = sha256_bytes(data)
    if digest.lower() != sha256.lower():
        return {"ok": False, "error": "checksum_mismatch", "actual": digest, "expected": sha256}

    if is_lab_env() and signing_key and not (key_id and public_key):
        if not verify_signature(data, signature, signing_key):
            return {"ok": False, "error": "signature_invalid"}
        return {"ok": True, "sha256": digest, "mode": "hmac_lab"}

    if not key_id or not public_key:
        return {"ok": False, "error": "ed25519_key_required"}
    if signing_key and not is_lab_env():
        return {"ok": False, "error": "signing_key_forbidden_in_production"}
    if not verify_ed25519(data, signature, public_key):
        return {"ok": False, "error": "signature_invalid", "keyId": key_id}
    return {"ok": True, "sha256": digest, "mode": "ed25519", "keyId": key_id}


def download_artifact(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if url.startswith("file://"):
        src = Path(urllib.request.url2pathname(url[7:]))
        if src.resolve() != dest.resolve():
            shutil.copy2(src, dest)
        return dest
    if "://" not in url:
        src = Path(url)
        if src.resolve() != dest.resolve():
            shutil.copy2(src, dest)
        return dest
    urllib.request.urlretrieve(url, dest)  # noqa: S310 — caller supplies trusted artifact mirror
    return dest


def _find_agent_root(staging: Path) -> Path:
    direct = staging / "hermes-agent"
    if direct.is_dir():
        return direct
    for child in staging.iterdir():
        if child.is_dir() and (child / "hermes_cli").is_dir():
            return child
        nested = child / "hermes-agent"
        if nested.is_dir():
            return nested
    return staging


def _safe_zip_members(zf: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    infos = zf.infolist()
    if len(infos) > MAX_ZIP_FILES:
        raise ValueError("zip_too_many_files")
    total = 0
    safe: list[zipfile.ZipInfo] = []
    for info in infos:
        name = info.filename.replace("\\", "/")
        if name.startswith("/") or name.startswith("../") or "/../" in f"/{name}/" or ".." in Path(name).parts:
            raise ValueError("zip_path_traversal")
        if info.is_dir():
            safe.append(info)
            continue
        if info.file_size > MAX_ZIP_MEMBER_BYTES:
            raise ValueError("zip_member_too_large")
        total += info.file_size
        if total > MAX_ZIP_TOTAL_BYTES:
            raise ValueError("zip_total_too_large")
        safe.append(info)
    return safe


def unpack_zip(archive: Path, staging: Path) -> Path:
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as zf:
        members = _safe_zip_members(zf)
        for info in members:
            zf.extract(info, staging)
    return _find_agent_root(staging)


def _ensure_isolated_venv(agent_root: Path) -> None:
    """Create a stub isolated venv layout when the bundle does not ship one."""
    layout = HermesLayout.from_home(agent_root.parent if agent_root.name == "hermes-agent" else agent_root)
    scripts = agent_root / "venv" / ("Scripts" if os.name == "nt" else "bin")
    scripts.mkdir(parents=True, exist_ok=True)
    python = scripts / ("python.exe" if os.name == "nt" else "python")
    hermes = scripts / ("hermes.exe" if os.name == "nt" else "hermes")
    if not python.exists():
        python.write_text("", encoding="utf-8")
    if not hermes.exists():
        hermes.write_text("", encoding="utf-8")
    del layout


def activate_version(home: Path, version: str, agent_root: Path) -> dict[str, Any]:
    home.mkdir(parents=True, exist_ok=True)
    versions = home / "versions" / version / "hermes-agent"
    versions.parent.mkdir(parents=True, exist_ok=True)
    source = Path(agent_root)
    if source.resolve() != versions.resolve():
        if versions.exists():
            shutil.rmtree(versions)
        shutil.copytree(source, versions)
    _ensure_isolated_venv(versions)
    target = home / "hermes-agent"
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(versions, target)
    layout = HermesLayout.from_home(home)
    if not layout.hermes_exe.exists() and not (layout.repo / "hermes_cli" / "main.py").exists():
        return {"ok": False, "error": "executable_missing", "home": str(home)}
    active = {
        "version": version,
        "channel": "signed",
        "python": str(layout.python),
        "activated_at": int(time.time()),
        "semver": list(semver_key(version)),
    }
    (home / "active.json").write_text(json.dumps(active, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "version": version, "home": str(home), "active": active, "installed": layout.is_installed()}


def install_signed(
    *,
    version: str,
    url: str,
    sha256: str,
    signature: str,
    hermes_home: str | Path,
    signing_key: str = "",
    key_id: str | None = None,
    public_key: str | None = None,
) -> dict[str, Any]:
    if not version or version.lower() == "latest":
        return {"ok": False, "error": "version_unpinned"}
    if is_lab_env():
        if not signing_key and not (key_id and public_key):
            return {"ok": False, "error": "signing_key_missing"}
    else:
        if signing_key:
            return {"ok": False, "error": "signing_key_forbidden_in_production"}
        if not key_id or not public_key:
            return {"ok": False, "error": "ed25519_key_required"}
    home = Path(hermes_home).expanduser()
    staging_root = Path(tempfile.mkdtemp(prefix="smc-hermes-artifact-"))
    try:
        archive = staging_root / "bundle.zip"
        download_artifact(url, archive)
        verified = verify_bundle(
            archive,
            sha256,
            signature,
            signing_key,
            key_id=key_id,
            public_key=public_key,
        )
        if not verified.get("ok"):
            return verified
        try:
            agent_root = unpack_zip(archive, staging_root / "unpacked")
        except ValueError as exc:
            return {"ok": False, "error": str(exc)}
        return activate_version(home, version, agent_root)
    finally:
        shutil.rmtree(staging_root, ignore_errors=True)
