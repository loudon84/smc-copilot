"""Build a Hermes managed offline bundle from a local git repository."""

from __future__ import annotations

import os
import subprocess
import argparse
import hashlib
import json
import shutil
import sys
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.release.hermes.build_node_packages import (  # noqa: E402
    inventory_packages,
    package_lock_digest,
    resolve_node_root,
    verify_declared_packages,
)
from tools.release.hermes.build_wheel import build_wheel  # noqa: E402
from tools.release.hermes.build_wheelhouse import (  # noqa: E402
    inventory_wheels,
    resolve_wheelhouse,
    wheelhouse_digest,
    write_requirements_lock,
)
from tools.release.hermes.runtime_profile import load_profiles, resolve_profile  # noqa: E402
from tools.release.hermes.release_version import resolve_release_version  # noqa: E402
from tools.release.hermes.release_v2 import build_hermes_release_v2  # noqa: E402
from tools.release.hermes.source_metadata import freeze_source  # noqa: E402
from tools.release.hermes.verify_runtime import scan_forbidden, verify_bundle_tree  # noqa: E402
from tools.release.hermes.windows_runtime import build_windows_runtime  # noqa: E402

DEFAULT_PROFILE = ROOT / "release" / "hermes-runtime-profiles.yaml"
DEFAULT_REQUIRES = {"python": ">=3.12,<3.13", "node": ">=22,<23"}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_runtime_build(
    dest: Path,
    *,
    source: dict[str, Any],
    profile_name: str,
    profile: dict[str, Any],
    python_items: list[dict[str, Any]],
    node_items: list[dict[str, Any]],
    node_lock_digest: str,
    build_id: str,
    requires: dict[str, str] | None = None,
) -> dict[str, Any]:
    payload = {
        "schema": "smc.hermes.runtime-build.v1",
        "version": source["version"],
        "platform": "windows",
        "architecture": "amd64",
        "requires": requires or DEFAULT_REQUIRES,
        "source": {
            "revision": source["revision"],
            "branch": source.get("branch", ""),
            "dirty": source["dirty"],
            "pyprojectSha256": source["pyprojectSha256"],
            "lockSha256": source["lockSha256"],
        },
        "profile": {"name": profile_name, "version": int(profile["version"])},
        "python": {
            "wheelCount": len(python_items),
            "wheelhouseDigest": wheelhouse_digest(python_items),
            "abi": "cp312",
        },
        "node": {
            "packageCount": len(node_items),
            "packageLockDigest": node_lock_digest,
        },
        "buildId": build_id,
        "liveEligible": bool(source.get("liveEligible")),
    }
    dest.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


def assemble_bundle(
    dest: Path,
    *,
    wheel: Path,
    wheelhouse: Path,
    node_root: Path,
    profile_name: str,
    profile: dict[str, Any],
    source: dict[str, Any],
    requires: dict[str, str] | None = None,
) -> Path:
    if dest.exists():
        shutil.rmtree(dest)
    app = dest / "app"
    python_wheels = dest / "python" / "wheels"
    node = dest / "node"
    config = dest / "config"
    licenses = dest / "LICENSES"
    for path in (app, python_wheels, node / "packages", config, licenses):
        path.mkdir(parents=True, exist_ok=True)
    shutil.copy2(wheel, app / wheel.name)
    copied = 0
    for item in sorted(wheelhouse.glob("*.whl")):
        shutil.copy2(item, python_wheels / item.name)
        copied += 1
    if copied == 0:
        raise ValueError("missing python dependency")
    python_items = inventory_wheels(python_wheels)
    if not (app / wheel.name).is_file():
        raise ValueError("hermes wheel missing")
    write_requirements_lock(dest / "python" / "requirements.lock", python_items)
    if (node_root / "package.json").is_file():
        shutil.copy2(node_root / "package.json", node / "package.json")
    if (node_root / "package-lock.json").is_file():
        shutil.copy2(node_root / "package-lock.json", node / "package-lock.json")
    packages_src = node_root / "packages"
    if packages_src.is_dir():
        for item in packages_src.glob("*.tgz"):
            shutil.copy2(item, node / "packages" / item.name)
    declared = (profile.get("node") or {}).get("packages") or []
    verify_declared_packages(declared, node / "packages")
    node_items = inventory_packages(node / "packages")
    package_json = json.loads((node / "package.json").read_text(encoding="utf-8")) if (node / "package.json").is_file() else {}
    node_digest = package_lock_digest(package_json, node_items)
    (config / "managed.defaults.yaml").write_text("schema: smc.opsi.managed-config.v1\nkeys: {}\n", encoding="utf-8")
    (config / "config.schema.yaml").write_text("schema: smc.hermes.config.v1\n", encoding="utf-8")
    (licenses / "NOTICE").write_text("SMC Hermes managed offline bundle\n", encoding="utf-8")
    (dest / "runtime-profile.json").write_text(
        json.dumps({"schema": "smc.hermes.runtime-profile.v1", "name": profile_name, "profile": profile}, indent=2)
        + "\n",
        encoding="utf-8",
    )
    build_id = datetime.now(UTC).strftime("build-%Y%m%dT%H%M%SZ")
    write_runtime_build(
        dest / "runtime-build.json",
        source=source,
        profile_name=profile_name,
        profile=profile,
        python_items=python_items,
        node_items=node_items,
        node_lock_digest=node_digest,
        build_id=build_id,
        requires=requires,
    )
    scan_forbidden(dest)
    verify_bundle_tree(dest)
    return dest


def zip_bundle(tree: Path, archive: Path) -> Path:
    archive.parent.mkdir(parents=True, exist_ok=True)
    if archive.exists():
        archive.unlink()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(p for p in tree.rglob("*") if p.is_file()):
            zf.write(path, arcname=path.relative_to(tree).as_posix())
    return archive


def verify_windows_runtime(
    runtime_tree: Path,
    *,
    expected_version: str = "",
) -> None:
    hermes_exe = runtime_tree / "bin" / "hermes.exe"
    python_exe = runtime_tree / "python" / "python.exe"
    node_exe = runtime_tree / "node" / "node.exe"

    for executable in (hermes_exe, python_exe, node_exe):
        if not executable.is_file():
            raise ValueError(
                f"runtime executable missing: {executable}"
            )

    if os.name != "nt":
        raise ValueError(
            "Windows runtime functional verification requires Windows build host"
        )

    system_root = Path(
        os.environ.get("SystemRoot", r"C:\Windows")
    )
    test_cwd = system_root / "Temp"

    test_home = runtime_tree.parent / "runtime-functional-test-home"
    test_home.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["HERMES_HOME"] = str(test_home)

    result = subprocess.run(
        [str(hermes_exe), "--version"],
        cwd=str(test_cwd),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )

    if result.returncode != 0:
        raise ValueError(
            "Hermes runtime launcher verification failed: "
            f"exit={result.returncode}; "
            f"stdout={result.stdout.strip()}; "
            f"stderr={result.stderr.strip()}"
        )

    output = (
        result.stdout.strip()
        or result.stderr.strip()
    )

    if expected_version and expected_version not in output:
        raise ValueError(
            "Hermes runtime version mismatch: "
            f"expected={expected_version}; actual={output}"
        )

def build_managed_bundle(
    repo: Path,
    dest: Path,
    *,
    profile_name: str = "smc-managed",
    profiles_path: Path | None = None,
    hermes_version: str = "",
    allow_dirty: bool = False,
    wheelhouse: Path | None = None,
    node_root: Path | None = None,
    wheel: Path | None = None,
    requires: dict[str, str] | None = None,
    mode: str = "online",
    wheelhouse_downloader=None,
    release_version: str = "",
    signing_key_ref: Path | None = None,
    smc_revision: int = 1,
    python_archive: Path | None = None,
    node_archive: Path | None = None,
    runtime_cache: Path | None = None,
    runtime_downloader=None,
) -> Path:
    if mode not in {"online", "offline"}:
        raise ValueError(f"unsupported build mode: {mode}")
    source = freeze_source(repo, hermes_version=hermes_version, allow_dirty=allow_dirty)
    profiles = load_profiles(profiles_path or DEFAULT_PROFILE)
    profile = resolve_profile(profiles, profile_name)
    work = dest / "work"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)
    if wheel is None:
        wheel = build_wheel(repo, work / "wheel")
    extras = list((profile.get("python") or {}).get("extras") or [])
    wheelhouse = resolve_wheelhouse(
        repo,
        work / "wheelhouse",
        extras,
        supplied=wheelhouse,
        mode=mode,
        downloader=wheelhouse_downloader,
    )
    declared = (profile.get("node") or {}).get("packages") or []
    node_root = resolve_node_root(declared, work / "node", supplied=node_root, mode=mode)
    tree = assemble_bundle(
        work / "bundle",
        wheel=wheel,
        wheelhouse=wheelhouse,
        node_root=node_root,
        profile_name=profile_name,
        profile=profile,
        source=source,
        requires=requires,
    )
    build_id = datetime.now(UTC).strftime("build-%Y%m%dT%H%M%SZ")
    archive = dest / f"hermes-{source['version']}-windows-amd64.zip"
    zip_bundle(tree, archive)
    (dest / f"{archive.name}.sha256").write_text(sha256_file(archive) + "\n", encoding="utf-8")
    shutil.copy2(tree / "runtime-build.json", dest / "runtime-build.json")
    if not release_version:
        release_version = resolve_release_version(str(source["version"]), smc_revision)
    runtime_tree = build_windows_runtime(
        tree,
        dest / "windows-runtime",
        cache_dir=runtime_cache or (dest / "runtime-cache"),
        python_archive=python_archive,
        node_archive=node_archive,
        mode=mode,
        downloader=runtime_downloader,
    )

    # Windows Runtime Functional Gate
    verify_windows_runtime(runtime_tree, expected_version=str(source["version"]))

    build_hermes_release_v2(
        runtime_tree,
        dest,
        source=source,
        release_version=release_version,
        signing_key_ref=signing_key_ref,
        build_id=build_id,
    )
    return archive


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--dest", type=Path, required=True)
    parser.add_argument("--profile", default="smc-managed")
    parser.add_argument("--profiles", type=Path)
    parser.add_argument("--hermes-version", default="")
    parser.add_argument("--allow-dirty", action="store_true")
    parser.add_argument("--wheelhouse", type=Path)
    parser.add_argument("--node-root", type=Path)
    parser.add_argument("--wheel", type=Path)
    parser.add_argument("--mode", choices=("online", "offline"), default="online")
    args = parser.parse_args()
    archive = build_managed_bundle(
        args.repo,
        args.dest,
        profile_name=args.profile,
        profiles_path=args.profiles,
        hermes_version=args.hermes_version,
        allow_dirty=args.allow_dirty,
        wheelhouse=args.wheelhouse,
        node_root=args.node_root,
        wheel=args.wheel,
        mode=args.mode,
    )
    print(archive)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
