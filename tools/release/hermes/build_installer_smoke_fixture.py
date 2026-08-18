#!/usr/bin/env python3
"""Generate release-v2-smoke fixture for installer Pester tests."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.release.hermes.release_v2 import (  # noqa: E402
    assemble_self_contained_tree,
    build_release_manifest,
    zip_release_tree,
)


def build_fixture(dest: Path, *, release_version: str = "0.22.0-smc.1") -> None:
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    work = dest / "_work"
    work.mkdir()
    (work / "bundle").mkdir(parents=True)
    (work / "bundle" / "runtime-build.json").write_text(
        json.dumps({"schema": "smc.hermes.runtime-build.v1", "liveEligible": False}) + "\n",
        encoding="utf-8",
    )
    tree = assemble_self_contained_tree(
        work / "bundle",
        work / "tree",
        release_version=release_version,
        hermes_version="0.22.0",
        build_id="build-smoke-fixture",
    )
    archive = zip_release_tree(tree, dest / "hermes-windows-amd64.zip")
    manifest = build_release_manifest(
        tree=tree,
        archive=archive,
        release_version=release_version,
        hermes_version="0.22.0",
        build_id="build-smoke-fixture",
        source={"revision": "smoke", "dirty": False, "liveEligible": False},
        signer_key_id="TEST-ONLY-ed25519",
    )
    (dest / "release-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (dest / "release-manifest.sig").write_bytes(b"")
    shutil.rmtree(work)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dest",
        type=Path,
        default=ROOT / "infra/windows/hermes-agent/tests/fixtures/release-v2-smoke",
    )
    parser.add_argument("--release-version", default="0.22.0-smc.1")
    args = parser.parse_args()
    build_fixture(args.dest, release_version=args.release_version)
    print(args.dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
