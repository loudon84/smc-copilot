"""Unified client release orchestrator (enterprise-native v2 production path).

Production stages: preflight → work → hermes-bootstrap → assemble → verify.
Managed Hermes ZIP / WiX installer / OPSI smc-hermes-agent removed in Phase 8.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.release.client.hermes_native_manifest import build_hermes_native_manifest  # noqa: E402
from tools.release.client.release_config import load_release_config  # noqa: E402
from tools.release.client.release_inventory import (  # noqa: E402
    capture_work_installers,
    scan_secrets,
    sha256_file,
    write_json,
    write_sha256sums,
)
from tools.release.client.release_manifest import build_client_release_manifest  # noqa: E402
from tools.release.client.verify_client_release import verify_client_release  # noqa: E402
from tools.release.subprocess_text import command_output, run_command  # noqa: E402

STAGES = (
    "preflight",
    "work",
    "hermes-bootstrap",
    "assemble",
    "verify",
    "all",
)

DEFAULT_HERMES_FORK_INSTALL_PS1 = Path(r"e:/git/hermes-agent/scripts/install.ps1")


def _run(cmd: list[str], cwd: Path | None = None) -> None:
    result = run_command(cmd, cwd=cwd)
    if result.returncode != 0:
        raise SystemExit(command_output(result, "command failed"))


def freeze_smc(allow_dirty: bool) -> dict[str, Any]:
    result = run_command(["git", "rev-parse", "HEAD"], cwd=ROOT)
    porcelain = run_command(["git", "status", "--porcelain"], cwd=ROOT)
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


def resolve_hermes_install_ps1(explicit: Path | None = None) -> Path:
    """Locate enterprise-fork install.ps1 for hermes-bootstrap stage."""
    if explicit is not None:
        path = Path(explicit)
        if path.is_file():
            return path
        raise SystemExit(f"Release FAILED: --hermes-install-ps1 not found: {path}")

    env = (os.environ.get("HERMES_FORK_INSTALL_PS1") or "").strip()
    if env:
        path = Path(env)
        if path.is_file():
            return path
        raise SystemExit(f"Release FAILED: HERMES_FORK_INSTALL_PS1 not found: {path}")

    if DEFAULT_HERMES_FORK_INSTALL_PS1.is_file():
        return DEFAULT_HERMES_FORK_INSTALL_PS1

    raise SystemExit(
        "Release FAILED: enterprise install.ps1 not found. "
        "Pass --hermes-install-ps1, set HERMES_FORK_INSTALL_PS1, "
        f"or place install.ps1 at {DEFAULT_HERMES_FORK_INSTALL_PS1}"
    )


def _optional_source_reachability(config: dict[str, Any]) -> dict[str, Any]:
    url = str(config["hermes"]["source"]["installUrl"])
    try:
        result = run_command(["git", "ls-remote", "--heads", url])
        return {
            "checked": True,
            "reachable": result.returncode == 0,
            "url": url,
            "detail": (result.stderr or result.stdout or "").strip()[:200],
        }
    except OSError as exc:
        return {"checked": True, "reachable": False, "url": url, "detail": str(exc)}


def run_preflight(
    config: dict[str, Any],
    *,
    allow_dirty: bool,
    check_source_reachability: bool = False,
) -> dict[str, Any]:
    """Validate loaded v2 config identity + freeze smc-copilot revision."""
    if config.get("hermes", {}).get("distribution") != "enterprise-native":
        raise SystemExit("Release FAILED: hermes.distribution must be enterprise-native")
    source = config["hermes"].get("source") or {}
    if not source.get("installUrl") or not source.get("approvedCommit"):
        raise SystemExit("Release FAILED: RELEASE_CONFIG_INVALID hermes.source incomplete")
    smc = freeze_smc(allow_dirty)
    out: dict[str, Any] = {"smc": smc, "hermesSource": dict(source)}
    if check_source_reachability:
        out["sourceReachability"] = _optional_source_reachability(config)
    return out


def run_work(config: dict[str, Any], dest: Path, *, work_dist: Path | None, runner=_run) -> dict[str, Any]:
    if not config["work"].get("enabled"):
        raise ValueError("Work build is required for client release")
    if work_dist is None:
        runner(["npx", "nx", "run", "work:package-win"], cwd=ROOT)
        work_dist = ROOT / "apps" / "work" / "dist"
    return capture_work_installers(work_dist, dest / "work")


def run_hermes_bootstrap(
    config: dict[str, Any],
    dest: Path,
    *,
    install_ps1: Path | None = None,
) -> dict[str, Any]:
    """Bundle enterprise install.ps1 + write hermes-native-manifest.json."""
    src = resolve_hermes_install_ps1(install_ps1)
    bootstrap_dir = dest / "hermes-bootstrap"
    bootstrap_dir.mkdir(parents=True, exist_ok=True)
    installer_bytes = src.read_bytes()
    target = bootstrap_dir / "install.ps1"
    target.write_bytes(installer_bytes)

    native = build_hermes_native_manifest(config, installer_bytes)
    manifest_path = bootstrap_dir / "hermes-native-manifest.json"
    write_json(manifest_path, native)

    # Also publish under manifests/ for inventory consumers.
    write_json(dest / "manifests" / "hermes-native-manifest.json", native)

    return {
        "installPs1": target,
        "manifestPath": manifest_path,
        "installerSha256": native["installerSha256"],
        "manifestSha256": sha256_file(manifest_path),
        "approvedCommit": native["approvedCommit"],
        "repositoryIdentity": native["repositoryIdentity"],
        "policyVersion": native["policyVersion"],
        "compatibility": native["compatibility"],
        "distribution": native["distribution"],
    }


def assemble(
    dest: Path,
    *,
    config: dict[str, Any],
    work: dict[str, Any],
    hermes_bootstrap: dict[str, Any],
    build_id: str,
    live_eligible: bool,
) -> dict[str, Any]:
    """Assemble Work + hermes-bootstrap only (no HermesZip / OPSI)."""
    work_dir = dest / "work"
    bootstrap_dir = dest / "hermes-bootstrap"
    if not any(work_dir.glob("copilot-desktop-*-setup.exe")):
        raise SystemExit("Release FAILED: assemble requires work installers under work/")
    if not (bootstrap_dir / "install.ps1").is_file():
        raise SystemExit("Release FAILED: assemble requires hermes-bootstrap/install.ps1")
    if not (bootstrap_dir / "hermes-native-manifest.json").is_file():
        raise SystemExit("Release FAILED: assemble requires hermes-bootstrap/hermes-native-manifest.json")

    # Forbidden production payloads (A-RELEASE-001/002).
    for pattern in ("**/hermes-*.zip", "**/hermes-windows-amd64.zip", "**/*.opsi", "**/wheelhouse/**"):
        hits = [p for p in dest.glob(pattern) if p.is_file() or p.is_dir()]
        if hits:
            raise SystemExit(
                f"Release FAILED: forbidden payload in assemble tree: {hits[0].relative_to(dest)}"
            )

    scan_secrets(dest)
    runtime = config.get("clientRuntime") or {}
    python_range = (runtime.get("python") or {}).get("range", ">=3.12,<3.13")
    node_range = (runtime.get("node") or {}).get("range", ">=22,<25")
    requirements = {"python": str(python_range), "node": str(node_range)}
    manifest = build_client_release_manifest(
        release_version=str(config["release"]["version"]),
        requirements=requirements,
        work=work,
        hermes_bootstrap=hermes_bootstrap,
        build_id=build_id,
        live_eligible=live_eligible,
    )
    write_json(dest / "manifests" / "client-release.json", manifest)
    write_json(
        dest / "manifests" / "provenance.json",
        {
            "buildId": build_id,
            "releaseVersion": config["release"]["version"],
            "createdAt": datetime.now(UTC).isoformat(),
            "distribution": "enterprise-native",
        },
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
    allow_dirty: bool = False,
    work_dist: Path | None = None,
    hermes_install_ps1: Path | None = None,
    check_source_reachability: bool = False,
    signing_key_ref: Path | None = None,
) -> Path:
    """Production release: preflight → work → hermes-bootstrap → assemble → verify.

    ``signing_key_ref`` is accepted for PowerShell wrapper compatibility but unused
    on the enterprise-native inventory path (no OPSI signature chain).
    """
    _ = signing_key_ref
    config = load_release_config(config_path)
    build_id = datetime.now(UTC).strftime("build-%Y%m%dT%H%M%SZ")
    dest = stage_root(output, str(config["release"]["version"]), build_id)
    run_preflight(
        config,
        allow_dirty=allow_dirty,
        check_source_reachability=check_source_reachability,
    )
    work = run_work(config, dest, work_dist=work_dist)
    bootstrap = run_hermes_bootstrap(config, dest, install_ps1=hermes_install_ps1)
    # Build success ≠ certified; liveEligible stays false until certification evidence exists.
    assemble(
        dest,
        config=config,
        work=work,
        hermes_bootstrap=bootstrap,
        build_id=build_id,
        live_eligible=False,
    )
    verify_client_release(dest, require_signatures=False)
    return dest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", nargs="?", default="all", choices=STAGES)
    parser.add_argument("--config", type=Path, default=ROOT / "release" / "client-release.yaml")
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    parser.add_argument("--signing-key-ref", type=Path)
    parser.add_argument("--allow-dirty", action="store_true")
    parser.add_argument("--work-dist", type=Path)
    parser.add_argument("--hermes-install-ps1", type=Path)
    parser.add_argument(
        "--check-source-reachability",
        action="store_true",
        help="Optionally probe hermes.source.installUrl via git ls-remote (non-fatal).",
    )
    args = parser.parse_args()
    config = load_release_config(args.config)
    build_id = datetime.now(UTC).strftime("build-%Y%m%dT%H%M%SZ")
    dest = stage_root(args.output, str(config["release"]["version"]), build_id)

    if args.stage == "preflight":
        run_preflight(
            config,
            allow_dirty=args.allow_dirty,
            check_source_reachability=args.check_source_reachability,
        )
        return 0

    if args.stage == "work":
        run_work(config, dest, work_dist=args.work_dist)
        return 0

    if args.stage == "hermes-bootstrap":
        meta = run_hermes_bootstrap(config, dest, install_ps1=args.hermes_install_ps1)
        print(meta["installPs1"])
        return 0

    if args.stage == "assemble":
        if args.work_dist is None:
            raise SystemExit("Release FAILED: assemble requires --work-dist")
        work = run_work(config, dest, work_dist=args.work_dist)
        bootstrap = run_hermes_bootstrap(config, dest, install_ps1=args.hermes_install_ps1)
        assemble(
            dest,
            config=config,
            work=work,
            hermes_bootstrap=bootstrap,
            build_id=build_id,
            live_eligible=False,
        )
        print(dest)
        return 0

    if args.stage == "verify":
        # Prefer newest client-release tree under --output when pointing at dist root.
        candidate = args.output
        if (candidate / "manifests" / "client-release.json").is_file():
            verify_client_release(candidate, require_signatures=False)
        else:
            trees = sorted(
                (p for p in candidate.glob("client-release/*/*") if p.is_dir()),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            if not trees:
                raise SystemExit(f"Release FAILED: no client-release tree under {candidate}")
            verify_client_release(trees[0], require_signatures=False)
        return 0

    dest = build_all(
        config_path=args.config,
        output=args.output,
        allow_dirty=args.allow_dirty,
        work_dist=args.work_dist,
        hermes_install_ps1=args.hermes_install_ps1,
        check_source_reachability=args.check_source_reachability,
        signing_key_ref=args.signing_key_ref,
    )
    print(dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
