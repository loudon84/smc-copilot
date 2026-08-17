#!/usr/bin/env python3
"""Build smc-hermes-agent package.

Smoke path writes a .smoke.zip (never .opsi) into --dest and must not mutate
CLIENT_DATA/artifacts or source release keys. Real release staging writes a
signed runtime/controller/release index tree. Operators publish with
opsi-package-manager; this script never publishes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import zipfile
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from artifact_v2 import (  # noqa: E402
    RELEASE_KEY_ID,
    SMOKE_KEY_ID,
    sha256_file,
    validate_entrypoint,
)
from artifact_v3 import (  # noqa: E402
    MANIFEST_SCHEMA,
    canonical_manifest_bytes,
    file_list_from_zip,
    sign_envelope,
    verify_envelope,
)
from control_schema import (  # noqa: E402
    ControlSchemaError,
    package_version as control_package_version,
    product_version as control_product_version,
    property_default,
    validate_control_schema,
)
from controller_manifest import (  # noqa: E402
    build_unsigned as build_controller_unsigned,
    sign_manifest,
    verify_manifest,
)
from product_release import (  # noqa: E402
    build_unsigned as build_release_unsigned,
    sign_index,
    verify_index,
)
from opsi_readback import readback_opsi  # noqa: E402

try:
    import cryptography
except ImportError:  # pragma: no cover
    cryptography = None

NATIVE_OPSI_TOOLS = ("opsi-makepackage", "opsi-package-manager", "opsi-cli")

PRODUCT = Path(__file__).resolve().parents[1]
SECRET_NAME_RE = re.compile(r"(private|credential|password|secret|\.env$)", re.I)
FORBIDDEN_SUFFIXES = {".pfx", ".p12", ".key"}
CONTROLLER_COPY = ("scripts", "bootstrap")


def _schema_fail(exc: ControlSchemaError) -> SystemExit:
    return SystemExit(str(exc))


def _source_control() -> dict:
    path = PRODUCT / "OPSI" / "control.toml"
    try:
        return validate_control_schema(path)
    except ControlSchemaError as exc:
        raise _schema_fail(exc) from exc


def _source_product_version() -> str:
    return control_product_version(_source_control())


def _source_package_version() -> str:
    return control_package_version(_source_control())


def _control_property_default(name: str) -> str:
    try:
        return property_default(_source_control(), name)
    except ControlSchemaError as exc:
        raise _schema_fail(exc) from exc


def _replace_table_field(text: str, table: str, field: str, value: str) -> str:
    header = f"[{table}]"
    chunks = re.split(r"(?=^\[)", text, flags=re.M)
    found = 0
    out: list[str] = []
    for chunk in chunks:
        first = chunk.split("\n", 1)[0].strip()
        if first != header:
            out.append(chunk)
            continue
        updated, count = re.subn(
            rf'(?m)^({re.escape(field)}\s*=\s*)"[^"]+"',
            rf'\1"{value}"',
            chunk,
            count=1,
        )
        if count != 1:
            raise SystemExit(f"failed to stage [{table}].{field}")
        found += 1
        out.append(updated)
    if found != 1:
        raise SystemExit(f"failed to stage [{table}].{field}")
    return "".join(out)


def _replace_property_default(text: str, name: str, value: str) -> str:
    chunks = re.split(r"(?=^\[\[ProductProperty\]\])", text, flags=re.M)
    replaced = 0
    out: list[str] = []
    for chunk in chunks:
        if chunk.startswith("[[ProductProperty]]") and re.search(
            rf'(?m)^name\s*=\s*"{re.escape(name)}"', chunk
        ):
            updated, count = re.subn(
                r'(?m)^(default\s*=\s*\[)"[^"]*"(\])',
                rf'\1"{value}"\2',
                chunk,
                count=1,
            )
            if count != 1:
                raise SystemExit(f"failed to stage ProductProperty {name}")
            replaced += 1
            out.append(updated)
        else:
            out.append(chunk)
    if replaced != 1:
        raise SystemExit(f"failed to stage ProductProperty {name}")
    return "".join(out)


def ensure_builder_runtime() -> None:
    if cryptography is None:
        raise SystemExit("SMC Builder requires cryptography")
    _ = cryptography.__version__


def ensure_native_opsi_tooling() -> None:
    if shutil.which("opsi-makepackage") is None:
        raise SystemExit("opsi-makepackage missing; native tooling required (no zipfile fallback)")
    missing = [name for name in NATIVE_OPSI_TOOLS if shutil.which(name) is None]
    if missing:
        raise SystemExit("OPSI native tooling missing: " + ", ".join(missing))
    tool = shutil.which("opsi-makepackage")
    result = subprocess.run(
        [str(tool), "--version"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        raise SystemExit((result.stderr or result.stdout or "opsi-makepackage --version failed").strip())


def stage_control_toml(
    dest: Path,
    *,
    product_version: str,
    package_version: str,
    hermes_version: str,
    controller_revision: str,
) -> Path:
    text = (PRODUCT / "OPSI" / "control.toml").read_text(encoding="utf-8")
    text = _replace_table_field(text, "Package", "version", package_version)
    text = _replace_table_field(text, "Product", "version", product_version)
    text = _replace_property_default(text, "hermes_version", hermes_version)
    text = _replace_property_default(text, "controller_revision", controller_revision)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text, encoding="utf-8")
    try:
        validate_control_schema(
            dest,
            expected_product_version=product_version,
            expected_package_version=package_version,
        )
    except ControlSchemaError as exc:
        raise _schema_fail(exc) from exc
    return dest


def _write_cli_zip(path: Path, version: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("hermes.exe", f"SMOKE-HERMES-CLI {version}\n".encode("utf-8"))
        zf.writestr("README.txt", f"smoke hermes contract fixture {version}\n")


def _load_private(path: Path):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    loaded = serialization.load_pem_private_key(path.read_bytes(), password=None)
    if not isinstance(loaded, Ed25519PrivateKey):
        raise SystemExit("signing key ref is not Ed25519")
    return loaded


def _write_public(private, dest: Path) -> None:
    from cryptography.hazmat.primitives import serialization

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(
        private.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )


def _sign_smoke(manifest: dict, artifact: Path, dest_keys: Path) -> None:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    dest_keys.mkdir(parents=True, exist_ok=True)
    private = Ed25519PrivateKey.generate()
    _write_public(private, dest_keys / "smoke-public-key.pem")
    digest = sha256_file(artifact)
    sig_path = artifact.parent / (artifact.name[: -len(".zip")] + ".sig")
    sig_path.write_bytes(sign_envelope(manifest, digest, private))
    man_path = artifact.parent / (artifact.name.replace(".zip", ".manifest.json"))
    man_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    verify_envelope(manifest, digest, sig_path.read_bytes(), private.public_key())


def hashlib_cli(zip_path: Path) -> str:
    with zipfile.ZipFile(zip_path) as zf:
        names = [name.replace("\\", "/") for name in zf.namelist()]
        if "hermes.exe" in names:
            return hashlib.sha256(zf.read("hermes.exe")).hexdigest()
        wheels = sorted(name for name in names if name.startswith("app/") and name.endswith(".whl"))
        if wheels:
            return hashlib.sha256(zf.read(wheels[0])).hexdigest()
    raise SystemExit("runtime CLI or Hermes wheel missing")


def _zip_member(archive: Path, name: str) -> bytes | None:
    target = name.replace("\\", "/")
    with zipfile.ZipFile(archive) as zf:
        for member in zf.namelist():
            if member.replace("\\", "/") == target:
                return zf.read(member)
    return None


def _runtime_build_from_zip(archive: Path) -> dict | None:
    raw = _zip_member(archive, "runtime-build.json")
    if raw is None:
        return None
    body = json.loads(raw.decode("utf-8"))
    if body.get("schema") != "smc.hermes.runtime-build.v1":
        raise SystemExit("invalid runtime-build.json schema")
    return body


def build_runtime_envelope(
    hermes_zip: Path,
    *,
    hermes_version: str,
    package_version: str,
    dest: Path,
    private_key,
    key_id: str,
) -> dict:
    if hermes_version.lower() == "latest":
        raise SystemExit("hermes version must be exact")
    if not hermes_zip.is_file():
        raise SystemExit("real Hermes Windows zip required")
    dest.mkdir(parents=True, exist_ok=True)
    artifact = dest / f"hermes-{hermes_version}-windows.zip"
    shutil.copy2(hermes_zip, artifact)
    digest = sha256_file(artifact)
    files = file_list_from_zip(artifact)
    inner = hashlib_cli(artifact)
    runtime_build = _runtime_build_from_zip(artifact)
    if runtime_build:
        build_version = str(runtime_build.get("version") or "")
        if build_version != hermes_version:
            raise SystemExit(f"runtime-build version mismatch: {build_version} != {hermes_version}")
        if runtime_build.get("platform") != "windows" or runtime_build.get("architecture") != "amd64":
            raise SystemExit("runtime-build platform must be windows/amd64")
        install_type = "python-wheelhouse"
        runtime_entrypoint = "venv/Scripts/hermes.exe"
        requires = runtime_build.get("requires") or {"python": ">=3.12,<3.13", "node": ">=22,<23"}
        profile = runtime_build.get("profile") or {"name": "smc-managed", "version": 1}
        runtime_build_sha256 = hashlib.sha256(_zip_member(artifact, "runtime-build.json") or b"").hexdigest()
    else:
        install_type = "binary-zip"
        runtime_entrypoint = "hermes.exe"
        requires = None
        profile = None
        runtime_build_sha256 = None
    manifest = {
        "schema": MANIFEST_SCHEMA,
        "version": hermes_version,
        "platform": "windows",
        "architecture": "amd64",
        "entrypoint": "hermes.exe",
        "sha256": digest,
        "cliSha256": inner,
        "cliVersion": hermes_version,
        "cliVersionCommand": ["--version"],
        "controllerCompat": ">=2",
        "packageRevision": package_version,
        "keyId": key_id,
        "bytes": artifact.stat().st_size,
        "files": files,
        "createdAt": datetime.now(UTC).isoformat(),
        "installType": install_type,
        "runtimeEntrypoint": runtime_entrypoint,
    }
    if requires:
        manifest["requires"] = requires
    if profile:
        manifest["profile"] = profile
    if runtime_build_sha256:
        manifest["runtimeBuildSha256"] = runtime_build_sha256
    validate_entrypoint(manifest["entrypoint"])
    canonical_manifest_bytes(manifest)
    signature = sign_envelope(manifest, digest, private_key)
    verify_envelope(manifest, digest, signature, private_key.public_key())
    man_path = dest / f"hermes-{hermes_version}-windows.manifest.json"
    sig_path = dest / f"hermes-{hermes_version}-windows.sig"
    man_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    sig_path.write_bytes(signature)
    return {
        "version": hermes_version,
        "manifestSha256": sha256_file(man_path),
        "artifactSha256": digest,
        "controllerCompat": manifest["controllerCompat"],
        "artifact": artifact,
        "manifest": man_path,
        "signature": sig_path,
    }


def assemble_controller_tree(dest: Path) -> Path:
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    src = PRODUCT / "controller"
    for path in src.iterdir():
        if path.name == "__pycache__" or path.suffix == ".pyc":
            continue
        target = dest / path.name
        if path.is_dir():
            shutil.copytree(path, target, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        else:
            shutil.copy2(path, target)
    for rel in CONTROLLER_COPY:
        origin = PRODUCT / rel
        if origin.is_dir():
            shutil.copytree(origin, dest / rel, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    verifier_src = src / "smc-artifact-verify.ps1"
    if not verifier_src.is_file():
        raise SystemExit("controller verifier script missing")
    return dest


def build_controller_envelope(dest: Path, revision: str, private_key, key_id: str) -> dict:
    tree = dest / "bundle"
    assemble_controller_tree(tree)
    unsigned = build_controller_unsigned(tree, revision, key_id=key_id)
    signed = sign_manifest(unsigned, private_key)
    man_path = tree / "controller.manifest.json"
    man_path.write_text(json.dumps(signed, indent=2) + "\n", encoding="utf-8")
    verify_manifest(json.loads(man_path.read_text(encoding="utf-8")), private_key.public_key(), tree)
    return {
        "revision": revision,
        "manifestSha256": sha256_file(man_path),
        "bundleDigest": signed["canonicalDigest"],
        "tree": tree,
        "manifest": man_path,
        "verifierSha256": sha256_file(tree / "smc-artifact-verify.ps1"),
    }


def _scan_stage(stage: Path) -> None:
    for path in stage.rglob("*"):
        if not path.is_file():
            continue
        name = path.name
        if SECRET_NAME_RE.search(name) and "public" not in name.lower():
            raise SystemExit(f"secret or private key leaked into stage: {path}")
        if path.suffix.lower() in FORBIDDEN_SUFFIXES:
            raise SystemExit(f"forbidden credential suffix in stage: {path}")
        if name == "release-private-key.pem" or "smoke-private" in name:
            raise SystemExit(f"private key leaked into stage: {path}")


def _write_sbom(stage: Path, product_version: str, package_version: str, files: list[dict]) -> None:
    sbom = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "version": 1,
        "metadata": {
            "component": {
                "type": "application",
                "name": "smc-hermes-agent",
                "version": f"{product_version}-{package_version}",
            }
        },
        "components": [
            {"type": "file", "name": item["path"], "hashes": [{"alg": "SHA-256", "content": item["sha256"]}]}
            for item in files
        ],
    }
    (stage / "OPSI" / "smc-sbom.cdx.json").write_text(json.dumps(sbom, indent=2) + "\n", encoding="utf-8")


def _write_provenance(stage: Path, *, source_revision: str, build_id: str, identity_digest: str) -> None:
    payload = {
        "sourceRevision": source_revision,
        "buildId": build_id,
        "identityDigest": identity_digest,
        "createdAt": datetime.now(UTC).isoformat(),
        "note": "createdAt is not part of identityDigest",
    }
    (stage / "OPSI" / "smc-provenance.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def stage_release(
    dest: Path,
    *,
    runtime: dict,
    controller: dict,
    release_index: dict,
    public_pem: bytes,
) -> Path:
    stage = dest / "stage"
    if stage.exists():
        shutil.rmtree(stage)
    (stage / "OPSI").mkdir(parents=True)
    (stage / "CLIENT_DATA").mkdir(parents=True)
    stage_control_toml(
        stage / "OPSI" / "control.toml",
        product_version=str(release_index["productVersion"]),
        package_version=str(release_index["packageVersion"]),
        hermes_version=str(runtime["version"]),
        controller_revision=str(controller["revision"]),
    )
    for script in ("setup.opsiscript", "update.opsiscript", "uninstall.opsiscript", "custom.opsiscript"):
        shutil.copy2(PRODUCT / "CLIENT_DATA" / script, stage / "CLIENT_DATA" / script)
    bootstrap = stage / "CLIENT_DATA" / "scripts"
    bootstrap.mkdir(parents=True)
    shutil.copy2(PRODUCT / "scripts" / "Invoke-SmcHermesAgent.ps1", bootstrap / "Invoke-SmcHermesAgent.ps1")
    common = bootstrap / "common"
    common.mkdir()
    shutil.copy2(PRODUCT / "scripts" / "common" / "SmcOpsi.psm1", common / "SmcOpsi.psm1")
    ctrl_dest = stage / "CLIENT_DATA" / "controller"
    shutil.copytree(controller["tree"], ctrl_dest)
    art = stage / "CLIENT_DATA" / "artifacts"
    art.mkdir()
    shutil.copy2(runtime["artifact"], art / runtime["artifact"].name)
    shutil.copy2(runtime["manifest"], art / runtime["manifest"].name)
    shutil.copy2(runtime["signature"], art / runtime["signature"].name)
    keys = stage / "CLIENT_DATA" / "keys"
    keys.mkdir()
    (keys / "release-public-key.pem").write_bytes(public_pem)
    (keys / "README.md").write_text("Public verify key only.\n", encoding="utf-8")
    index_path = stage / "OPSI" / "product-release.json"
    index_path.write_text(json.dumps(release_index, indent=2) + "\n", encoding="utf-8")
    _scan_stage(stage)
    inventory = []
    for path in sorted(p for p in stage.rglob("*") if p.is_file()):
        rel = path.relative_to(stage).as_posix()
        inventory.append({"path": rel, "sha256": sha256_file(path), "bytes": path.stat().st_size})
    identity = hashlib.sha256(
        json.dumps(inventory, separators=(",", ":"), sort_keys=True).encode("utf-8")
    ).hexdigest()
    (stage / "OPSI" / "smc-artifact-manifest.json").write_text(
        json.dumps(
            {
                "productId": "smc-hermes-agent",
                "productVersion": release_index["productVersion"],
                "packageVersion": release_index["packageVersion"],
                "platform": "windows",
                "identityDigest": identity,
                "files": inventory,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    _write_sbom(stage, release_index["productVersion"], release_index["packageVersion"], inventory)
    _write_provenance(
        stage,
        source_revision=release_index["sourceRevision"],
        build_id=release_index["buildId"],
        identity_digest=identity,
    )
    _scan_stage(stage)
    return stage


def write_opsi_archive(stage: Path, dest: Path, product_version: str, package_version: str) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    archive = dest / f"smc-hermes-agent_{product_version}-{package_version}.fixture.zip"
    if archive.name.endswith(".opsi") or archive.suffix == ".opsi":
        raise SystemExit("zipfile path must not emit .opsi")
    if archive.exists():
        archive.unlink()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(p for p in stage.rglob("*") if p.is_file()):
            zf.write(path, arcname=path.relative_to(stage).as_posix())
    (dest / f"{archive.name}.sha256").write_text(sha256_file(archive) + "\n", encoding="utf-8")
    return archive


def build_opsi_native(stage: Path, dest: Path, product_version: str, package_version: str) -> Path:
    ensure_native_opsi_tooling()
    try:
        validate_control_schema(
            stage / "OPSI" / "control.toml",
            expected_product_version=product_version,
            expected_package_version=package_version,
        )
    except ControlSchemaError as exc:
        raise _schema_fail(exc) from exc
    tool = shutil.which("opsi-makepackage")
    dest.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [str(tool)],
        cwd=stage,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        raise SystemExit((result.stderr or result.stdout or "opsi-makepackage failed").strip())
    produced = list(stage.glob("*.opsi"))
    if not produced:
        produced = list(stage.glob("**/*.opsi"))
    expected_name = f"smc-hermes-agent_{product_version}-{package_version}.opsi"
    archive = dest / expected_name
    match = next((path for path in produced if path.name == expected_name), produced[0] if produced else None)
    if match is None:
        raise SystemExit("opsi-makepackage did not emit .opsi")
    if match.resolve() != archive.resolve():
        if archive.exists():
            archive.unlink()
        shutil.move(str(match), str(archive))
    (dest / f"{archive.name}.sha256").write_text(sha256_file(archive) + "\n", encoding="utf-8")
    return archive


def _ensure_smoke_artifact(dest: Path, hermes_version: str, package_version: str) -> Path:
    artifacts = dest / "artifacts"
    artifacts.mkdir(parents=True, exist_ok=True)
    zip_path = artifacts / f"hermes-{hermes_version}-windows.zip"
    _write_cli_zip(zip_path, hermes_version)
    digest = sha256_file(zip_path)
    inner = hashlib_cli(zip_path)
    files = file_list_from_zip(zip_path)
    manifest = {
        "schema": MANIFEST_SCHEMA,
        "version": hermes_version,
        "platform": "windows",
        "architecture": "amd64",
        "entrypoint": "hermes.exe",
        "sha256": digest,
        "cliSha256": inner,
        "cliVersion": hermes_version,
        "cliVersionCommand": ["--version"],
        "controllerCompat": ">=2",
        "packageRevision": package_version,
        "keyId": SMOKE_KEY_ID,
        "bytes": zip_path.stat().st_size,
        "files": files,
        "createdAt": datetime.now(UTC).isoformat(),
    }
    validate_entrypoint(manifest["entrypoint"])
    canonical_manifest_bytes(manifest)
    _sign_smoke(manifest, zip_path, dest / "keys")
    return zip_path


def _collect_files(*, skip_artifacts: bool = False) -> list[Path]:
    files: list[Path] = []
    for rel in ("OPSI", "CLIENT_DATA", "scripts", "bootstrap", "managed", "controller"):
        root = PRODUCT / rel
        if root.is_dir():
            files.extend([path for path in root.rglob("*") if path.is_file()])
    out = []
    for path in files:
        if "release-private-key.pem" in path.name or "smoke-private" in path.name:
            continue
        rel = path.relative_to(PRODUCT)
        if skip_artifacts and rel.parts[:2] == ("CLIENT_DATA", "artifacts"):
            continue
        if skip_artifacts and rel.parts[:2] == ("CLIENT_DATA", "keys"):
            continue
        out.append(path)
    return out


def _write_archive(archive: Path, product_version: str, package_version: str, extra_root: Path | None = None) -> None:
    if archive.exists():
        archive.unlink()
    files = _collect_files(skip_artifacts=extra_root is not None)
    manifest = []
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in files:
            rel = path.relative_to(PRODUCT)
            parts = rel.parts
            if parts[0] in {"scripts", "bootstrap", "managed", "controller"}:
                arc = "CLIENT_DATA/" + str(rel).replace("\\", "/")
            else:
                arc = str(rel).replace("\\", "/")
            zf.write(path, arcname=arc)
            manifest.append({"path": arc, "sha256": sha256_file(path), "bytes": path.stat().st_size})
        if extra_root:
            for path in extra_root.rglob("*"):
                if path.is_file():
                    arc = "CLIENT_DATA/" + str(path.relative_to(extra_root)).replace("\\", "/")
                    zf.write(path, arcname=arc)
                    manifest.append({"path": arc, "sha256": sha256_file(path), "bytes": path.stat().st_size})
        zf.writestr(
            "OPSI/smc-artifact-manifest.json",
            json.dumps(
                {
                    "productId": "smc-hermes-agent",
                    "productVersion": product_version,
                    "packageVersion": package_version,
                    "platform": "windows",
                    "files": manifest,
                },
                indent=2,
            )
            + "\n",
        )


def build_smoke(dest: Path) -> Path:
    product_version = _source_product_version()
    package_version = _source_package_version()
    hermes_version = _control_property_default("hermes_version")
    if "latest" in product_version.lower() or hermes_version.lower() == "latest":
        raise SystemExit("productVersion/hermes_version must be exact")
    source_pub = PRODUCT / "CLIENT_DATA" / "keys" / "release-public-key.pem"
    before = source_pub.read_bytes() if source_pub.exists() else None
    work = dest / "smoke-tree"
    if work.exists():
        shutil.rmtree(work)
    _ensure_smoke_artifact(work, hermes_version, package_version)
    dest.mkdir(parents=True, exist_ok=True)
    archive = dest / f"smc-hermes-agent_{product_version}-{package_version}.smoke.zip"
    _write_archive(archive, product_version, package_version, extra_root=work)
    after = source_pub.read_bytes() if source_pub.exists() else None
    if before != after:
        raise SystemExit("smoke must not rewrite source release public key")
    print(f"wrote {archive}")
    return archive


def prepare_release_stage(
    dest: Path,
    hermes_zip: Path,
    key_ref: Path,
    *,
    hermes_version: str = "",
    product_version: str = "",
    package_version: str = "",
    controller_revision: str = "",
) -> dict:
    if not hermes_zip.is_file():
        raise SystemExit("real Hermes Windows zip required")
    if not key_ref.is_file():
        raise SystemExit("release signing key ref missing; refusing to autogenerate")
    ensure_builder_runtime()
    source_art = PRODUCT / "CLIENT_DATA" / "artifacts"
    before_arts = {p: p.read_bytes() for p in source_art.glob("*")} if source_art.is_dir() else {}
    product_version = product_version or _source_product_version()
    package_version = package_version or _source_package_version()
    runtime_build = _runtime_build_from_zip(hermes_zip)
    runtime_version = hermes_version or (str(runtime_build.get("version") or "") if runtime_build else "") or _control_property_default("hermes_version")
    if runtime_build and str(runtime_build.get("version") or "") != runtime_version:
        raise SystemExit(f"runtime-build version mismatch: {runtime_build.get('version')} != {runtime_version}")
    controller_revision = controller_revision or _control_property_default("controller_revision")
    private = _load_private(key_ref)
    key_id = RELEASE_KEY_ID if "TEST-ONLY" not in key_ref.name.upper() else SMOKE_KEY_ID
    work = dest / "release-work"
    if work.exists():
        shutil.rmtree(work)
    runtime = build_runtime_envelope(
        hermes_zip,
        hermes_version=runtime_version,
        package_version=package_version,
        dest=work / "runtime",
        private_key=private,
        key_id=key_id,
    )
    controller = build_controller_envelope(work / "controller", controller_revision, private, key_id)
    source_revision = "local-dev"
    git = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=PRODUCT,
        check=False,
    )
    if git.returncode == 0:
        source_revision = git.stdout.strip()[:40]
    unsigned = build_release_unsigned(
        product_version=product_version,
        package_version=package_version,
        controller={
            "revision": controller["revision"],
            "manifestSha256": controller["manifestSha256"],
            "bundleDigest": controller["bundleDigest"],
        },
        runtimes=[
            {
                "version": runtime["version"],
                "manifestSha256": runtime["manifestSha256"],
                "artifactSha256": runtime["artifactSha256"],
                "controllerCompat": runtime["controllerCompat"],
            }
        ],
        verifier={"platform": "windows-amd64", "sha256": controller["verifierSha256"], "entrypoint": "smc-artifact-verify.ps1"},
        source_revision=source_revision or "unknownrev",
        build_id=datetime.now(UTC).strftime("build-%Y%m%dT%H%M%SZ"),
        key_id=key_id,
        live_eligible=False,
    )
    signed = sign_index(unsigned, private)
    verify_index(signed, private.public_key())
    from cryptography.hazmat.primitives import serialization

    public_pem = private.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    stage = stage_release(work, runtime=runtime, controller=controller, release_index=signed, public_pem=public_pem)
    after_arts = {p: p.read_bytes() for p in source_art.glob("*")} if source_art.is_dir() else {}
    if before_arts != after_arts:
        raise SystemExit("release must not rewrite source artifacts")
    return {
        "stage": stage,
        "runtime": runtime,
        "controller": controller,
        "release_index": signed,
        "product_version": product_version,
        "package_version": package_version,
        "hermes_version": runtime_version,
        "controller_revision": controller_revision,
        "work": work,
    }


def package_stage(stage: Path, dest: Path, product_version: str, package_version: str, *, opsi_tooling: str) -> Path:
    if opsi_tooling == "native":
        return build_opsi_native(stage, dest, product_version, package_version)
    if opsi_tooling == "zipfile":
        archive = write_opsi_archive(stage, dest, product_version, package_version)
        if archive.name.endswith(".opsi"):
            raise SystemExit("zipfile path must not emit .opsi")
        return archive
    raise SystemExit(f"unsupported opsi tooling: {opsi_tooling}")


def build_release(
    dest: Path,
    hermes_zip: Path,
    key_ref: Path,
    *,
    hermes_version: str = "",
    product_version: str = "",
    package_version: str = "",
    controller_revision: str = "",
    opsi_tooling: str = "native",
) -> Path:
    prepared = prepare_release_stage(
        dest,
        hermes_zip,
        key_ref,
        hermes_version=hermes_version,
        product_version=product_version,
        package_version=package_version,
        controller_revision=controller_revision,
    )
    archive = package_stage(
        prepared["stage"],
        dest,
        prepared["product_version"],
        prepared["package_version"],
        opsi_tooling=opsi_tooling,
    )
    readback_opsi(archive, prepared["stage"], extract_root=dest / "readback")
    print(f"wrote {archive}")
    return archive


def build(dest: Path) -> Path:
    return build_smoke(dest)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--dest", type=Path, default=PRODUCT / "dist")
    parser.add_argument("--hermes-zip", type=Path)
    parser.add_argument("--hermes-version", default="")
    parser.add_argument("--signing-key-ref", type=Path)
    parser.add_argument("--production-depot", action="store_true", help="forbidden unless operator override")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--opsi-tooling", choices=("zipfile", "native"), default="native")
    args = parser.parse_args()
    if args.production_depot or args.publish:
        raise SystemExit("refusing to publish to production depot from this script")
    ensure_builder_runtime()
    if args.hermes_zip:
        if not args.signing_key_ref:
            raise SystemExit("release path requires --signing-key-ref")
        build_release(
            args.dest,
            args.hermes_zip,
            args.signing_key_ref,
            hermes_version=args.hermes_version,
            opsi_tooling=args.opsi_tooling,
        )
        return 0
    archive = build_smoke(args.dest)
    if archive.stat().st_size < 100:
        raise SystemExit("package too small")
    if archive.name.endswith(".opsi"):
        raise SystemExit("smoke path must not emit .opsi")
    if SMOKE_KEY_ID == RELEASE_KEY_ID:
        raise SystemExit("smoke key id must not equal release key id")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
