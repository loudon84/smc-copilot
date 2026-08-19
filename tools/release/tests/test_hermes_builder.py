from __future__ import annotations

import hashlib
import io
import json
import subprocess
import tarfile
import zipfile
from pathlib import Path

import pytest

from tools.release.hermes.build_node_packages import (
    assert_pinned,
    resolve_node_root,
    verify_declared_packages,
    write_package_manifest,
)
from tools.release.hermes.build_runtime import assemble_bundle, build_managed_bundle, zip_bundle
from tools.release.hermes.build_wheelhouse import (
    assert_wheelhouse_binary_only,
    assert_windows_amd64_wheel,
    inventory_wheels,
    resolve_wheelhouse,
)
from tools.release.hermes.release_version import resolve_from_source, resolve_release_version
from tools.release.hermes.runtime_profile import load_profiles, resolve_profile
from tools.release.hermes.source_metadata import freeze_source
from tools.release.hermes.verify_runtime import verify_bundle_tree, verify_bundle_zip
from tools.release.hermes.windows_runtime import (
    _install_windows_console_hook,
    assert_pe_amd64,
    build_windows_runtime,
)

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
    # Stub Node workspace manifests so build_managed_bundle can copy them into the release tree.
    pkg_json = json.dumps({"name": "hermes-agent", "version": version, "private": True}, indent=2)
    lock_json = json.dumps({"name": "hermes-agent", "lockfileVersion": 3, "packages": {}}, indent=2)
    (repo / "package.json").write_text(pkg_json + "\n", encoding="utf-8")
    (repo / "package-lock.json").write_text(lock_json + "\n", encoding="utf-8")
    _git(repo, "init")
    _git(repo, "config", "user.email", "builder@example.com")
    _git(repo, "config", "user.name", "builder")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "freeze")
    if dirty:
        (repo / "dirty.txt").write_text("dirty\n", encoding="utf-8")
    return repo


def _wheel(path: Path, name: str, *, module: str = "__init__.py", content: str = "# stub\n") -> Path:
    path.mkdir(parents=True, exist_ok=True)
    file = path / name
    pkg = name.split("-")[0]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(f"{pkg}/{module}", content)
    file.write_bytes(buf.getvalue())
    return file


def _pe_amd64() -> bytes:
    data = bytearray(0x88)
    data[0:2] = b"MZ"
    data[0x3C:0x40] = (0x80).to_bytes(4, "little")
    data[0x80:0x84] = b"PE\x00\x00"
    data[0x84:0x86] = (0x8664).to_bytes(2, "little")
    return bytes(data)


def _zip_tree(root: Path, archive: Path) -> Path:
    archive.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive, "w") as zf:
        for path in sorted(p for p in root.rglob("*") if p.is_file()):
            zf.write(path, arcname=path.relative_to(root).as_posix())
    return archive


def _runtime_archives(tmp_path: Path) -> tuple[Path, Path]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    python_root = tmp_path / "python-embed"
    python_root.mkdir()
    (python_root / "python.exe").write_bytes(_pe_amd64())
    (python_root / "python312._pth").write_text("python312.zip\n.\n", encoding="ascii")
    node_root = tmp_path / "node-v22.11.0-win-x64"
    node_root.mkdir()
    (node_root / "node.exe").write_bytes(_pe_amd64())
    return (
        _zip_tree(python_root, tmp_path / "python-3.12.8-embed-amd64.zip"),
        _zip_tree(node_root, tmp_path / "node-v22.11.0-win-x64.zip"),
    )


def _npm_pack(name: str, version: str) -> bytes:
    payload = json.dumps({"name": name, "version": version}).encode("utf-8")
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        info = tarfile.TarInfo(name="package/package.json")
        info.size = len(payload)
        tar.addfile(info, io.BytesIO(payload))
    return buf.getvalue()


def _bundle_kwargs(tmp_path: Path) -> dict[str, Path]:
    python_archive, node_archive = _runtime_archives(tmp_path / "runtime-archives")
    return {"python_archive": python_archive, "node_archive": node_archive}


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
    _wheel(house, "hermes_agent-0.20.2-py3-none-any.whl", module="hermes_cli/main.py", content="def main():\n    return 0\n")
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
    wheel = _wheel(tmp_path / "app", "hermes_agent-0.20.2-py3-none-any.whl", module="hermes_cli/main.py", content="def main():\n    return 0\n")
    house = tmp_path / "wheels"
    _wheel(house, "hermes_agent-0.20.2-py3-none-any.whl", module="hermes_cli/main.py", content="def main():\n    return 0\n")
    _wheel(house, "pydantic-2.11.0-py3-none-any.whl")
    node_root = tmp_path / "node"
    write_package_manifest(node_root, profile["node"]["packages"])
    tgz = node_root / "packages" / "modelcontextprotocol-server-filesystem-2025.8.21.tgz"
    tgz.parent.mkdir(parents=True, exist_ok=True)
    tgz.write_bytes(_npm_pack("@modelcontextprotocol/server-filesystem", "2025.8.21"))
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


def _bundle_inputs(tmp_path: Path, *, dirty: bool = False) -> tuple[Path, Path, Path, Path]:
    repo = _hermes_repo(tmp_path, dirty=dirty)
    wheel = _wheel(
        tmp_path / "app",
        "hermes_agent-0.20.2-py3-none-any.whl",
        module="hermes_cli/main.py",
        content="def main():\n    return 0\n",
    )
    house = tmp_path / "wheels"
    _wheel(house, "hermes_agent-0.20.2-py3-none-any.whl", module="hermes_cli/main.py", content="def main():\n    return 0\n")
    _wheel(house, "pydantic-2.11.0-py3-none-any.whl")
    node_root = tmp_path / "node"
    write_package_manifest(node_root, [{"name": "@modelcontextprotocol/server-filesystem", "version": "2025.8.21"}])
    tgz = node_root / "packages" / "modelcontextprotocol-server-filesystem-2025.8.21.tgz"
    tgz.parent.mkdir(parents=True, exist_ok=True)
    tgz.write_bytes(_npm_pack("@modelcontextprotocol/server-filesystem", "2025.8.21"))
    return repo, wheel, house, node_root


def test_rb01_clean_sources(tmp_path: Path):
    repo, wheel, house, node_root = _bundle_inputs(tmp_path)
    archive = build_managed_bundle(
        repo,
        tmp_path / "out",
        wheel=wheel,
        wheelhouse=house,
        node_root=node_root,
        mode="offline",
        **_bundle_kwargs(tmp_path),
    )
    assert archive.is_file()
    build = json.loads((tmp_path / "out" / "runtime-build.json").read_text(encoding="utf-8"))
    assert build["liveEligible"] is True
    assert (tmp_path / "out" / "work" / "bundle" / "python" / "requirements.lock").is_file()


def test_rb02_dirty_source_fails(tmp_path: Path):
    repo, wheel, house, node_root = _bundle_inputs(tmp_path, dirty=True)
    with pytest.raises(ValueError, match="dirty"):
        build_managed_bundle(
            repo,
            tmp_path / "out",
            wheel=wheel,
            wheelhouse=house,
            node_root=node_root,
            mode="offline",
            **_bundle_kwargs(tmp_path),
        )


def test_rb03_automatic_wheelhouse(tmp_path: Path):
    repo, wheel, house, node_root = _bundle_inputs(tmp_path)
    fetched: list[Path] = []

    def _download(_repo: Path, dest: Path, _extras: list[str]) -> Path:
        dest.mkdir(parents=True, exist_ok=True)
        for item in house.glob("*.whl"):
            dest.joinpath(item.name).write_bytes(item.read_bytes())
        fetched.append(dest)
        return dest

    archive = build_managed_bundle(
        repo,
        tmp_path / "out",
        wheel=wheel,
        node_root=node_root,
        mode="online",
        wheelhouse_downloader=_download,
        **_bundle_kwargs(tmp_path),
    )
    assert archive.is_file()
    assert fetched
    items = inventory_wheels(fetched[0])
    assert {item["name"] for item in items} >= {"hermes_agent", "pydantic"}


def test_rb03_offline_requires_wheelhouse_cache(tmp_path: Path):
    repo, wheel, _house, node_root = _bundle_inputs(tmp_path)
    with pytest.raises(ValueError, match="offline build requires --wheelhouse"):
        build_managed_bundle(repo, tmp_path / "out", wheel=wheel, node_root=node_root, mode="offline")


def test_rb04_wrong_wheel_platform(tmp_path: Path):
    with pytest.raises(ValueError, match="wrong platform"):
        assert_windows_amd64_wheel("cryptography-42.0.0-cp312-cp312-macosx_11_0_arm64.whl")
    with pytest.raises(ValueError, match="wrong platform"):
        assert_windows_amd64_wheel("psutil-6.0.0-cp312-cp312-win_arm64.whl")
    house = tmp_path / "wheels"
    _wheel(house, "cryptography-42.0.0-cp312-cp312-manylinux2014_x86_64.whl")
    with pytest.raises(ValueError, match="wrong platform"):
        resolve_wheelhouse(tmp_path, tmp_path / "wh", [], supplied=house, mode="offline")


def test_rb05_missing_python_wheel_and_sdist(tmp_path: Path):
    empty = tmp_path / "empty"
    empty.mkdir()
    with pytest.raises(ValueError, match="empty|missing python"):
        inventory_wheels(empty)
    sdist = tmp_path / "sdist"
    sdist.mkdir()
    (sdist / "pydantic-2.11.0.tar.gz").write_bytes(b"sdist")
    with pytest.raises(ValueError, match="sdist-only"):
        assert_wheelhouse_binary_only(sdist)


def test_rb06_node_exact_package(tmp_path: Path):
    packages = [{"name": "@modelcontextprotocol/server-filesystem", "version": "2025.8.21"}]
    dest = tmp_path / "node"
    write_package_manifest(dest, packages)
    tgz = dest / "packages" / "modelcontextprotocol-server-filesystem-2025.8.21.tgz"
    tgz.parent.mkdir(parents=True, exist_ok=True)
    tgz.write_bytes(_npm_pack("@modelcontextprotocol/server-filesystem", "2025.8.21"))
    resolved = resolve_node_root(packages, tmp_path / "unused", supplied=dest, mode="offline")
    assert resolved == dest
    verify_declared_packages(packages, dest / "packages")


def test_rb07_node_latest_fails():
    with pytest.raises(ValueError, match="not pinned"):
        assert_pinned("latest")


def test_rb08_bundle_build(tmp_path: Path):
    repo, wheel, house, node_root = _bundle_inputs(tmp_path)
    archive = build_managed_bundle(
        repo,
        tmp_path / "out",
        wheel=wheel,
        wheelhouse=house,
        node_root=node_root,
        mode="offline",
        **_bundle_kwargs(tmp_path),
    )
    verify_bundle_zip(archive)
    lock = (tmp_path / "out" / "work" / "bundle" / "python" / "requirements.lock").read_text(encoding="utf-8")
    assert "sha256=" in lock
    assert "hermes_agent-0.20.2-py3-none-any.whl" in lock


def test_release_v2_self_contained(tmp_path: Path):
    repo, wheel, house, node_root = _bundle_inputs(tmp_path)
    dest = tmp_path / "out"
    archive = build_managed_bundle(
        repo,
        dest,
        wheel=wheel,
        wheelhouse=house,
        node_root=node_root,
        mode="offline",
        release_version="0.20.2-smc.1",
        **_bundle_kwargs(tmp_path),
    )
    release_zip = dest / "hermes-windows-amd64.zip"
    manifest_path = dest / "release-manifest.json"
    assert release_zip.is_file()
    assert manifest_path.is_file()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["schema"] == "smc.hermes.release.v2"
    assert manifest["releaseVersion"] == "0.20.2-smc.1"
    assert manifest["sha256"] == hashlib.sha256(release_zip.read_bytes()).hexdigest()
    with zipfile.ZipFile(release_zip) as zf:
        names = set(zf.namelist())
    assert "bin/hermes.exe" in names
    assert "python/python.exe" in names
    assert "node/node.exe" in names
    assert "scripts/HostOperations.ps1" in names
    assert "runtime/runtime-build.json" in names
    assert "python/Lib/site-packages/smc_windows_vt.py" in names
    assert "python/Lib/site-packages/zz_smc_windows_vt.pth" in names
    # v2.1: node workspace must be under node/hermes-agent/, not node/node_modules/
    assert "node/hermes-agent/package.json" in names
    assert not any(n.startswith("node/node_modules/") for n in names)
    assert archive.is_file()


def test_release_version_resolution():
    assert resolve_release_version("0.20.2", 1) == "0.20.2-smc.1"
    with pytest.raises(ValueError, match="mismatch"):
        resolve_from_source("0.20.2", {"hermesInstaller": {"releaseVersion": "0.21.0-smc.1", "smcRevision": 1}})


def test_windows_runtime_builder(tmp_path: Path):
    repo, wheel, house, node_root = _bundle_inputs(tmp_path)
    profile = resolve_profile(load_profiles(PROFILES), "smc-managed")
    source = freeze_source(repo)
    bundle = assemble_bundle(
        tmp_path / "bundle",
        wheel=wheel,
        wheelhouse=house,
        node_root=node_root,
        profile_name="smc-managed",
        profile=profile,
        source=source,
    )
    python_archive, node_archive = _runtime_archives(tmp_path / "runtime-archives")
    tree = build_windows_runtime(
        bundle,
        tmp_path / "runtime",
        python_archive=python_archive,
        node_archive=node_archive,
        mode="offline",
    )
    assert_pe_amd64(tree / "bin" / "hermes.exe")
    assert_pe_amd64(tree / "python" / "python.exe")
    assert_pe_amd64(tree / "node" / "node.exe")
    assert (tree / "scripts" / "SmcHermesManaged.psm1").is_file()
    # v2.1: hermes-agent workspace must be at node/hermes-agent/
    assert (tree / "node" / "hermes-agent").is_dir()
    # node/node_modules must not exist at the top level (workspace is under hermes-agent/)
    assert not (tree / "node" / "node_modules").exists()
    site = tree / "python" / "Lib" / "site-packages"
    hook = (site / "smc_windows_vt.py").read_text(encoding="utf-8")
    pth = (site / "zz_smc_windows_vt.pth").read_text(encoding="ascii")
    assert "ENABLE_VIRTUAL_TERMINAL_PROCESSING" in hook
    assert "just_fix_windows_console" in hook
    assert pth.strip() == "import smc_windows_vt"
    assert not (tree / "python" / "sitecustomize.py").exists()


def test_windows_console_hook_uses_pth_not_sitecustomize(tmp_path: Path):
    site = tmp_path / "site-packages"
    _install_windows_console_hook(site)
    assert (site / "smc_windows_vt.py").is_file()
    assert (site / "zz_smc_windows_vt.pth").read_text(encoding="ascii") == "import smc_windows_vt\n"
    assert not (tmp_path / "sitecustomize.py").exists()


def test_windows_vt_hook_is_noop_off_windows(monkeypatch: pytest.MonkeyPatch):
    from tools.release.hermes import smc_windows_vt

    monkeypatch.setattr(smc_windows_vt.sys, "platform", "linux")
    smc_windows_vt.enable_windows_vt()


def test_windows_vt_hook_loads_as_site_module(tmp_path: Path):
    import importlib.util

    site = tmp_path / "site-packages"
    _install_windows_console_hook(site)
    spec = importlib.util.spec_from_file_location("smc_windows_vt", site / "smc_windows_vt.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert callable(module.enable_windows_vt)
