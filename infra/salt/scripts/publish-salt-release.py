#!/usr/bin/env python3
"""Publish versioned Salt fileserver release (extensions + states).

Layout:
  <releases-root>/<version>/
    _modules/ _states/ _utils/ _returners/  (from infra/salt/extensions)
    ... states from infra/salt/states + top.sls
  <releases-root>/current -> <version>
  <releases-root>/previous -> <prior>

Does not edit live Master trees in place; ops copies the release atomically.
"""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import UTC, datetime
from pathlib import Path


def _copy_tree(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def publish(repo_salt: Path, releases_root: Path, version: str) -> dict:
    releases_root.mkdir(parents=True, exist_ok=True)
    target = releases_root / version
    if target.exists():
        raise SystemExit(f"release already exists: {target}")

    ext = repo_salt / "extensions"
    states = repo_salt / "states"
    target.mkdir(parents=True)
    for name in ("_modules", "_states", "_utils", "_returners", "_beacons", "_grains", "_pillar"):
        src = ext / name
        if src.is_dir():
            _copy_tree(src, target / name)
    # States at release root for file_roots base
    states_dst = target / "states"
    _copy_tree(states, states_dst)
    # Convenience: also flatten top.sls expected by some roots
    if (states / "top.sls").is_file():
        shutil.copy2(states / "top.sls", target / "top.sls")

    current = releases_root / "current"
    previous = releases_root / "previous"
    if current.exists() or current.is_symlink():
        if previous.exists() or previous.is_symlink():
            if previous.is_symlink() or previous.is_dir():
                if previous.is_dir() and not previous.is_symlink():
                    shutil.rmtree(previous)
                else:
                    previous.unlink()
        # Move current -> previous (symlink or dir)
        current.rename(previous)
    # New current as symlink when possible, else marker file
    try:
        current.symlink_to(target.name, target_is_directory=True)
    except OSError:
        current.mkdir(exist_ok=True)
        (current / "RELEASE").write_text(version + "\n", encoding="utf-8")
        for child in target.iterdir():
            dest = current / child.name
            if child.is_dir():
                _copy_tree(child, dest)
            else:
                shutil.copy2(child, dest)

    meta = {
        "schema": "smc.salt-release.v1",
        "version": version,
        "publishedAt": datetime.now(UTC).isoformat(),
        "path": str(target),
    }
    (target / "release.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return meta


def rollback(releases_root: Path) -> dict:
    current = releases_root / "current"
    previous = releases_root / "previous"
    if not previous.exists() and not previous.is_symlink():
        raise SystemExit("no previous release to rollback")
    staging = releases_root / f".rollback-tmp-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}"
    if current.exists() or current.is_symlink():
        current.rename(staging)
    previous.rename(current)
    if staging.exists() or staging.is_symlink():
        staging.rename(previous)
    return {"ok": True, "current": str(current.resolve() if current.exists() else current)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-salt", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--releases-root", type=Path, required=True)
    sub = parser.add_subparsers(dest="cmd", required=True)
    pub = sub.add_parser("publish")
    pub.add_argument("--version", required=True)
    sub.add_parser("rollback")
    args = parser.parse_args(argv)
    if args.cmd == "publish":
        meta = publish(args.repo_salt, args.releases_root, args.version)
        print(json.dumps(meta))
        return 0
    print(json.dumps(rollback(args.releases_root)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
