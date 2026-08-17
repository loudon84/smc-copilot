"""Unified client release orchestrator (R00-R18)."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.release.client.release_config import load_release_config  # noqa: E402
from tools.release.client.release_inventory import (  # noqa: E402
    capture_opsi_client_installer,
    capture_work_installers,
    scan_secrets,
    sha256_file,
    write_json,
    write_sha256sums,
)
from tools.release.client.release_manifest import build_client_release_manifest  # noqa: E402
from tools.release.client.verify_client_release import verify_client_release  # noqa: E402
from tools.release.hermes.source_metadata import freeze_source  # noqa: E402

STAGES = (
    "preflight",
    "work",
    "hermes",
    "runtime",
    "opsi-stage",
    "opsi-package",
    "assemble",
    "verify",
    "all",
)


def _run(cmd: list[str], cwd: Path | None = None) -> None:
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise SystemExit(result.stderr.strip() or result.stdout.strip() or "command failed")


def freeze_smc(allow_dirty: bool) -> dict[str, Any]:
    result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=False)
    porcelain = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True, check=False)
    dirty = bool(porcelain.stdout.strip())
    if dirty and not allow_dirty:
        raise ValueError("dirty smc-copilot source is forbidden for production builds")
    revision = (result.stdout or "").strip()
    if len(revision) < 7:
        raise ValueError("smc-copilot git revision missing")
    return {"revision": revision, "dirty": dirty, "liveEligible": not dirty}


def stage_root(output: Path, version: str, build_id: str) -> Path:
    path = output / "client-release" / version / build_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def run_work(config: dict[str, Any], dest: Path, *, work_dist: Path | None, runner=_run) -> dict[str, Any]:
    if not config["work"].get("enabled"):
        raise ValueError("Work build is required for client release")
    if work_dist is None:
        runner(["npx", "nx", "run", "work:package-win"], cwd=ROOT)
        work_dist = ROOT / "apps" / "work" / "dist"
    return capture_work_installers(work_dist, dest / "work")


def run_preflight(config: dict[str, Any], *, allow_dirty: bool, hermes_repo: Path | None) -> dict[str, Any]:
    smc = freeze_smc(allow_dirty)
    repo = Path(hermes_repo or config["hermes"]["repo"])
    hermes = freeze_source(
        repo,
        hermes_version="" if config["hermes"]["version"] == "auto" else str(config["hermes"]["version"]),
        allow_dirty=allow_dirty,
    )
    return {"smc": smc, "hermes": hermes}


def copy_runtime_artifacts(hermes_zip: Path, dest: Path) -> dict[str, Any]:
    hermes_dir = dest / "hermes"
    hermes_dir.mkdir(parents=True, exist_ok=True)
    copied = hermes_dir / hermes_zip.name
    shutil.copy2(hermes_zip, copied)
    manifest = hermes_zip.with_name(hermes_zip.name.replace(".zip", ".manifest.json"))
    sig = hermes_zip.with_name(hermes_zip.name.replace(".zip", ".sig"))
    manifest_sha = ""
    if manifest.is_file():
        shutil.copy2(manifest, hermes_dir / manifest.name)
        manifest_sha = sha256_file(hermes_dir / manifest.name)
    if sig.is_file():
        shutil.copy2(sig, hermes_dir / sig.name)
    return {
        "artifactSha256": sha256_file(copied),
        "manifestSha256": manifest_sha or ("00" * 32),
        "version": hermes_zip.name.split("-")[1] if "-" in hermes_zip.name else "",
    }


def copy_opsi_package(opsi_pkg: Path, dest: Path) -> dict[str, Any]:
    opsi_dir = dest / "opsi"
    opsi_dir.mkdir(parents=True, exist_ok=True)
    copied = opsi_dir / opsi_pkg.name
    shutil.copy2(opsi_pkg, copied)
    sha_file = opsi_pkg.with_name(opsi_pkg.name + ".sha256")
    if sha_file.is_file():
        shutil.copy2(sha_file, opsi_dir / sha_file.name)
    return {"artifactSha256": sha256_file(copied)}


def assemble(
    dest: Path,
    *,
    config: dict[str, Any],
    work: dict[str, Any],
    hermes: dict[str, Any],
    opsi: dict[str, Any],
    opsi_client: dict[str, Any],
    build_id: str,
    live_eligible: bool,
) -> dict[str, Any]:
    scan_secrets(dest)
    requirements = {
        "python": config["clientRuntime"]["python"]["range"],
        "node": config["clientRuntime"]["node"]["range"],
    }
    manifest = build_client_release_manifest(
        release_version=str(config["release"]["version"]),
        requirements=requirements,
        work=work,
        hermes=hermes,
        opsi=opsi,
        opsi_client_agent=opsi_client,
        build_id=build_id,
        live_eligible=live_eligible,
    )
    write_json(dest / "manifests" / "client-release.json", manifest)
    write_json(
        dest / "manifests" / "provenance.json",
        {"buildId": build_id, "releaseVersion": config["release"]["version"], "createdAt": datetime.now(UTC).isoformat()},
    )
    write_json(
        dest / "manifests" / "sbom.cdx.json",
        {"bomFormat": "CycloneDX", "specVersion": "1.5", "version": 1, "components": []},
    )
    write_sha256sums(dest)
    return manifest


def build_all(
    *,
    config_path: Path,
    output: Path,
    hermes_repo: Path | None = None,
    opsi_client_installer: Path | None = None,
    signing_key_ref: Path | None = None,
    allow_dirty: bool = False,
    work_dist: Path | None = None,
    hermes_zip: Path | None = None,
    opsi_pkg: Path | None = None,
    enroll_script: Path | None = None,
) -> Path:
    config = load_release_config(config_path)
    build_id = datetime.now(UTC).strftime("build-%Y%m%dT%H%M%SZ")
    dest = stage_root(output, str(config["release"]["version"]), build_id)
    frozen = run_preflight(config, allow_dirty=allow_dirty, hermes_repo=hermes_repo)
    work = run_work(config, dest, work_dist=work_dist)
    if hermes_zip is None:
        raise ValueError("hermes zip required (build hermes/runtime stages first)")
    hermes_meta = copy_runtime_artifacts(hermes_zip, dest)
    hermes_meta.update(
        {
            "profile": config["hermes"]["profile"],
            "sourceRevision": frozen["hermes"]["revision"],
            "version": frozen["hermes"]["version"],
        }
    )
    if opsi_pkg is None:
        raise ValueError("opsi package required (build opsi-package stage first)")
    opsi_meta = copy_opsi_package(opsi_pkg, dest)
    opsi_meta.update(
        {
            "productVersion": config["opsi"]["productVersion"],
            "packageVersion": config["opsi"]["packageVersion"],
            "controllerRevision": config["opsi"]["controllerRevision"],
        }
    )
    installer = Path(opsi_client_installer or config["external"]["opsiClientInstaller"])
    opsi_client = capture_opsi_client_installer(installer, dest / "bootstrap")
    script = enroll_script or (ROOT / "scripts" / "opsi-connect-lab-client.ps1")
    if script.is_file():
        shutil.copy2(script, dest / "bootstrap" / "opsi-enroll-local-client.ps1")
    live = bool(frozen["smc"]["liveEligible"] and frozen["hermes"]["liveEligible"] and signing_key_ref)
    assemble(
        dest,
        config=config,
        work=work,
        hermes=hermes_meta,
        opsi=opsi_meta,
        opsi_client=opsi_client,
        build_id=build_id,
        live_eligible=live,
    )
    verify_client_release(dest)
    return dest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", nargs="?", default="all", choices=STAGES)
    parser.add_argument("--config", type=Path, default=ROOT / "release" / "client-release.yaml")
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    parser.add_argument("--hermes-repo", type=Path)
    parser.add_argument("--opsi-client-installer", type=Path)
    parser.add_argument("--signing-key-ref", type=Path)
    parser.add_argument("--allow-dirty", action="store_true")
    parser.add_argument("--work-dist", type=Path)
    parser.add_argument("--hermes-zip", type=Path)
    parser.add_argument("--opsi-package", type=Path)
    args = parser.parse_args()
    config = load_release_config(args.config)
    if args.stage == "preflight":
        run_preflight(config, allow_dirty=args.allow_dirty, hermes_repo=args.hermes_repo)
        return 0
    if args.stage == "work":
        build_id = datetime.now(UTC).strftime("build-%Y%m%dT%H%M%SZ")
        dest = stage_root(args.output, str(config["release"]["version"]), build_id)
        run_work(config, dest, work_dist=args.work_dist)
        return 0
    if args.stage in {"hermes", "runtime", "opsi-stage", "opsi-package"}:
        raise SystemExit(f"{args.stage} requires hermes builder / makepackage inputs; use --hermes-zip/--opsi-package with assemble")
    dest = build_all(
        config_path=args.config,
        output=args.output,
        hermes_repo=args.hermes_repo,
        opsi_client_installer=args.opsi_client_installer,
        signing_key_ref=args.signing_key_ref,
        allow_dirty=args.allow_dirty,
        work_dist=args.work_dist,
        hermes_zip=args.hermes_zip,
        opsi_pkg=args.opsi_package,
    )
    print(dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
