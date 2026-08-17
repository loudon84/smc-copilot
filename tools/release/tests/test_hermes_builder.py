from __future__ import annotations

import hashlib
import json
import subprocess
import zipfile
from pathlib import Path

import pytest

from tools.release.hermes.build_node_packages import assert_pinned, verify_declared_packages, write_package_manifest
from tools.release.hermes.build_runtime import assemble_bundle, zip_bundle
from tools.release.hermes.build_wheelhouse import assert_windows_amd64_wheel, inventory_wheels
from tools.release.hermes.runtime_profile import load_profiles, resolve_profile
from tools.release.hermes.source_metadata import freeze_source
from tools.release.hermes.verify_runtime import verify_bundle_tree, verify_bundle_zip

ROOT = Path(__file__).resolve().parents[3]
PROFILES = ROOT / "release" / "hermes-runtime-profiles.yaml"


def _git(repo: Path, *args: str) -> None:
    result = subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "git failed")


def _hermes_repo(tmp_path: Path, version: str = "0.20.2", dirty: bool = False) -> Path:
    repo = tmp_path / "hermes-agent"
    repo.mkdir()
    (repo / "pyproject.toml").write_text(
        f'[project]\nname = "hermes-agent"\nversion = "{version}"\n',
        encoding="utf-8",
    )
    (repo / "uv.lock").write_text("version = 1\nrequires-python = '>=3.12'\n", encoding="utf-8")
    _git(repo, "init")
    _git(repo, "config", "user.email", "builder@example.com")
    _git(repo, "config", "user.name", "builder")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "freeze")
    if dirty:
        (repo / "dirty.txt").write_text("dirty\n", encoding="utf-8")
    return repo


def _wheel(path: Path, name: str, payload: bytes = b"wheel") -> Path:
    path.mkdir(parents=True, exist_ok=True)
    file = path / name
    file.write_bytes(payload)
    return file


def test_h01_clean_git_source(tmp_path: Path):
    repo = _hermes_repo(tmp_path)
    source = freeze_source(repo)
    assert source["dirty"] is False
    assert source["liveEligible"] is True
    assert source["version"] == "0.20.2"
    assert len(source["revision"]) >= 7
    assert len(source["pyprojectSha256"]) == 64
    assert len(source["lockSha256"]) == 64


def test_h02_dirty_production_source_fails(tmp_path: Path):
    repo = _hermes_repo(tmp_path, dirty=True)
    with pytest.raises(ValueError, match="dirty"):
        freeze_source(repo)
    source = freeze_source(repo, allow_dirty=True)
    assert source["dirty"] is True
    assert source["liveEligible"] is False


def test_h03_version_match(tmp_path: Path):
    repo = _hermes_repo(tmp_path, version="0.20.2")
    source = freeze_source(repo, hermes_version="0.20.2")
    assert source["version"] == "0.20.2"


def test_h04_version_mismatch_and_forbidden(tmp_path: Path):
    repo = _hermes_repo(tmp_path, version="0.20.2")
    with pytest.raises(ValueError, match="mismatch"):
        freeze_source(repo, hermes_version="0.21.0")
    with pytest.raises(ValueError, match="forbidden"):
        freeze_source(repo, hermes_version="latest")


def test_h05_windows_wheelhouse_complete(tmp_path: Path):
    house = tmp_path / "wheels"
    _wheel(house, "hermes_agent-0.20.2-py3-none-any.whl")
    _wheel(house, "pydantic-2.11.0-py3-none-any.whl")
    _wheel(house, "pydantic_core-2.33.0-cp312-cp312-win_amd64.whl")
    items = inventory_wheels(house)
    assert len(items) == 3
    assert {item["name"] for item in items} >= {"hermes_agent", "pydantic", "pydantic_core"}


def test_h06_wrong_platform_wheel_fails(tmp_path: Path):
    with pytest.raises(ValueError, match="wrong platform"):
        assert_windows_amd64_wheel("cryptography-42.0.0-cp312-cp312-manylinux2014_x86_64.whl")
    with pytest.raises(ValueError, match="wrong platform"):
        assert_windows_amd64_wheel("psutil-6.0.0-cp312-cp312-win32.whl")
    house = tmp_path / "wheels"
    _wheel(house, "cryptography-42.0.0-cp312-cp312-manylinux2014_x86_64.whl")
    with pytest.raises(ValueError, match="wrong platform"):
        inventory_wheels(house)


def test_h07_runtime_profile_valid():
    data = load_profiles(PROFILES)
    profile = resolve_profile(data, "smc-managed")
    assert profile["python"]["lazyInstall"]["allowed"] is False
    assert profile["node"]["packages"][0]["version"] != "latest"
    with pytest.raises(ValueError, match="not defined"):
        resolve_profile(data, "smc-finance")


def test_h08_missing_python_dependency(tmp_path: Path):
    house = tmp_path / "empty"
    house.mkdir()
    with pytest.raises(ValueError, match="empty|missing python"):
        inventory_wheels(house)


def test_h09_missing_node_dependency(tmp_path: Path):
    with pytest.raises(ValueError, match="not pinned"):
        assert_pinned("latest")
    packages_dir = tmp_path / "packages"
    packages_dir.mkdir()
    with pytest.raises(ValueError, match="missing node"):
        verify_declared_packages(
            [{"name": "@modelcontextprotocol/server-filesystem", "version": "2025.8.21"}],
            packages_dir,
        )


def test_assemble_bundle_rejects_python_runtime_and_secrets(tmp_path: Path):
    repo = _hermes_repo(tmp_path)
    source = freeze_source(repo)
    profile = resolve_profile(load_profiles(PROFILES), "smc-managed")
    wheel = _wheel(tmp_path / "app", "hermes_agent-0.20.2-py3-none-any.whl")
    house = tmp_path / "wheels"
    _wheel(house, "hermes_agent-0.20.2-py3-none-any.whl")
    _wheel(house, "pydantic-2.11.0-py3-none-any.whl")
    node_root = tmp_path / "node"
    write_package_manifest(node_root, profile["node"]["packages"])
    tgz = node_root / "packages" / "modelcontextprotocol-server-filesystem-2025.8.21.tgz"
    tgz.parent.mkdir(parents=True, exist_ok=True)
    tgz.write_bytes(b"tgz")
    dest = tmp_path / "bundle"
    assemble_bundle(
        dest,
        wheel=wheel,
        wheelhouse=house,
        node_root=node_root,
        profile_name="smc-managed",
        profile=profile,
        source=source,
    )
    assert (dest / "runtime-build.json").is_file()
    assert not (dest / "python.exe").exists()
    build = json.loads((dest / "runtime-build.json").read_text(encoding="utf-8"))
    assert build["schema"] == "smc.hermes.runtime-build.v1"
    assert build["liveEligible"] is True
    (dest / "python.exe").write_bytes(b"no")
    with pytest.raises(ValueError, match="forbidden"):
        verify_bundle_tree(dest)
    (dest / "python.exe").unlink()
    archive = zip_bundle(dest, tmp_path / "hermes-0.20.2-windows-amd64.zip")
    with zipfile.ZipFile(archive) as zf:
        names = zf.namelist()
    assert "runtime-build.json" in names
    assert "python/wheels/pydantic-2.11.0-py3-none-any.whl" in names
    verify_bundle_zip(archive)
    hashlib.sha256(archive.read_bytes()).hexdigest()
