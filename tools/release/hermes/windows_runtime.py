"""Assemble a self-contained Windows Hermes runtime from build artifacts."""

from __future__ import annotations

import hashlib
import io
import json
import shutil
import tarfile
import zipfile
from pathlib import Path
from typing import Any, Callable
from urllib.request import urlopen
from zipfile import ZIP_STORED, ZipFile

ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_ROOT = ROOT / "infra" / "windows" / "hermes-agent" / "scripts"
ENDPOINT_SCRIPTS = ("HostOperations.ps1", "HostOperations.psm1", "SmcHermesManaged.psm1")

PYTHON_VERSION = "3.12.8"
NODE_VERSION = "22.11.0"
PYTHON_EMBED_URL = f"https://www.python.org/ftp/python/{PYTHON_VERSION}/python-{PYTHON_VERSION}-embed-amd64.zip"
PYTHON_EMBED_SHA256 = "8d3f33be9eb810f23c102f08475af2854e50484b8e4e06275e937be61ce3d2fb"
NODE_DIST_URL = f"https://nodejs.org/dist/v{NODE_VERSION}/node-v{NODE_VERSION}-win-x64.zip"
NODE_DIST_SHA256 = "905373a059aecaf7f48c1ce10ffbd5334457ca00f678747f19db5ea7d256c236"

PE_AMD64 = 0x8664
Downloader = Callable[[str, Path, str], Path]


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def assert_pe_amd64(path: Path) -> None:
    data = path.read_bytes()
    if len(data) < 0x40 or data[:2] != b"MZ":
        raise ValueError(f"not a PE executable: {path.name}")
    e_lfanew = int.from_bytes(data[0x3C:0x40], "little")
    if e_lfanew <= 0 or e_lfanew + 6 > len(data) or data[e_lfanew : e_lfanew + 4] != b"PE\x00\x00":
        raise ValueError(f"not a PE executable: {path.name}")
    machine = int.from_bytes(data[e_lfanew + 4 : e_lfanew + 6], "little")
    if machine != PE_AMD64:
        raise ValueError(f"wrong architecture: {path.name}")


def _download(url: str, dest: Path, expected_sha256: str) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file() and sha256_file(dest) == expected_sha256:
        return dest
    with urlopen(url, timeout=60) as response:  # noqa: S310 - pinned official distro URL + digest
        payload = response.read()
    digest = hashlib.sha256(payload).hexdigest()
    if digest != expected_sha256:
        raise ValueError(f"hash mismatch for {dest.name}")
    dest.write_bytes(payload)
    return dest


def _resolve_archive(
    *,
    name: str,
    url: str,
    expected_sha256: str,
    cache_dir: Path,
    supplied: Path | None,
    mode: str,
    downloader: Downloader | None,
) -> Path:
    if supplied is not None:
        if not supplied.is_file():
            raise ValueError(f"{name} archive missing: {supplied}")
        return supplied
    cached = cache_dir / Path(url).name
    if cached.is_file() and sha256_file(cached) == expected_sha256:
        return cached
    if mode == "offline":
        raise ValueError(f"offline build requires {name} archive cache")
    fetch = downloader or _download
    archive = fetch(url, cached, expected_sha256)
    if sha256_file(archive) != expected_sha256:
        raise ValueError(f"hash mismatch for {name} archive")
    return archive


def _extract_zip(archive: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    with ZipFile(archive) as zf:
        zf.extractall(dest)


def _find_file(root: Path, name: str) -> Path:
    matches = sorted(path for path in root.rglob(name) if path.is_file())
    if not matches:
        raise ValueError(f"{name} missing")
    return matches[0]


def _promote_runtime_root(extracted: Path, names: tuple[str, ...]) -> Path:
    found = [_find_file(extracted, name) for name in names]
    parents = {path.parent.resolve() for path in found}
    if len(parents) != 1:
        raise ValueError("runtime layout is not a single directory")
    return next(iter(parents))


def _enable_python_site(python_root: Path) -> None:
    pth = python_root / "python312._pth"
    lines = [
        "python312.zip",
        ".",
        r"Lib\site-packages",
        "import site",
        "",
    ]
    pth.write_text("\n".join(lines), encoding="ascii")
    (python_root / "Lib" / "site-packages").mkdir(parents=True, exist_ok=True)


def _install_wheels(wheels: list[Path], site_packages: Path) -> None:
    if not wheels:
        raise ValueError("missing python dependency")
    site_packages.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    for wheel in wheels:
        if wheel.name.lower() in seen:
            continue
        seen.add(wheel.name.lower())
        if not zipfile.is_zipfile(wheel):
            raise ValueError(f"invalid wheel: {wheel.name}")
        with ZipFile(wheel) as zf:
            zf.extractall(site_packages)


def _load_distlib_launcher() -> bytes:
    try:
        import pip._vendor.distlib as distlib_mod
    except ImportError as exc:
        raise ValueError("Windows console launcher stub missing (distlib t64.exe)") from exc
    root = Path(distlib_mod.__file__).resolve().parent
    launcher = root / "t64.exe"
    if not launcher.is_file():
        raise ValueError("Windows console launcher stub missing (distlib t64.exe)")
    return launcher.read_bytes()


def write_hermes_launcher(dest: Path, *, python_rel: str = r"..\python\python.exe") -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    script = (
        "# -*- coding: utf-8 -*-\n"
        "import re\n"
        "import sys\n"
        "from hermes_cli.main import main\n"
        "\n"
        "if __name__ == '__main__':\n"
        "    sys.argv[0] = re.sub(r'(-script\\.pyw|\\.exe)?$', '', sys.argv[0])\n"
        "    sys.exit(main())\n"
    )
    buf = io.BytesIO()
    with ZipFile(buf, "w", compression=ZIP_STORED) as zf:
        zf.writestr("__main__.py", script)
    shebang = f"#!{python_rel}\r\n".encode("ascii")
    dest.write_bytes(_load_distlib_launcher() + shebang + buf.getvalue())
    assert_pe_amd64(dest)
    return dest


def _extract_npm_pack(archive: Path, node_modules: Path) -> None:
    if not tarfile.is_tarfile(archive):
        raise ValueError(f"invalid node package: {archive.name}")
    with tarfile.open(archive, "r:gz") as tar:
        members = [member for member in tar.getmembers() if member.name.startswith("package/")]
        if not members:
            raise ValueError(f"invalid node package: {archive.name}")
        staging = node_modules / f".{archive.stem}"
        if staging.exists():
            shutil.rmtree(staging)
        staging.mkdir(parents=True)
        tar.extractall(staging, members=members, filter="data")
    package_root = staging / "package"
    pkg_json = package_root / "package.json"
    if not pkg_json.is_file():
        raise ValueError(f"invalid node package: {archive.name}")
    name = str(json.loads(pkg_json.read_text(encoding="utf-8")).get("name") or "").strip()
    if not name:
        raise ValueError(f"invalid node package: {archive.name}")
    target = node_modules.joinpath(*name.split("/"))
    if target.exists():
        shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(package_root), str(target))
    shutil.rmtree(staging, ignore_errors=True)


def _copy_endpoint_scripts(dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    for name in ENDPOINT_SCRIPTS:
        src = SCRIPTS_ROOT / name
        if not src.is_file():
            raise ValueError(f"missing endpoint script: {name}")
        shutil.copy2(src, dest / name)


def _collect_wheels(bundle_root: Path) -> list[Path]:
    wheels = sorted((bundle_root / "app").glob("*.whl"))
    wheels.extend(sorted((bundle_root / "python" / "wheels").glob("*.whl")))
    if not wheels:
        raise ValueError("missing python dependency")
    return wheels


def build_windows_runtime(
    bundle_root: Path,
    dest: Path,
    *,
    python_version: str = PYTHON_VERSION,
    node_version: str = NODE_VERSION,
    cache_dir: Path | None = None,
    python_archive: Path | None = None,
    node_archive: Path | None = None,
    mode: str = "online",
    downloader: Downloader | None = None,
) -> Path:
    bundle_root = bundle_root.resolve()
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    cache = cache_dir or (dest.parent / "runtime-cache")
    py_zip = _resolve_archive(
        name="python",
        url=PYTHON_EMBED_URL,
        expected_sha256=PYTHON_EMBED_SHA256,
        cache_dir=cache,
        supplied=python_archive,
        mode=mode,
        downloader=downloader,
    )
    node_zip = _resolve_archive(
        name="node",
        url=NODE_DIST_URL,
        expected_sha256=NODE_DIST_SHA256,
        cache_dir=cache,
        supplied=node_archive,
        mode=mode,
        downloader=downloader,
    )

    python_extract = dest / "_python-extract"
    node_extract = dest / "_node-extract"
    _extract_zip(py_zip, python_extract)
    _extract_zip(node_zip, node_extract)
    python_src = _promote_runtime_root(python_extract, ("python.exe",))
    node_src = _promote_runtime_root(node_extract, ("node.exe",))
    python_root = dest / "python"
    node_root = dest / "node"
    shutil.copytree(python_src, python_root)
    shutil.copytree(node_src, node_root)
    shutil.rmtree(python_extract, ignore_errors=True)
    shutil.rmtree(node_extract, ignore_errors=True)

    _enable_python_site(python_root)
    _install_wheels(_collect_wheels(bundle_root), python_root / "Lib" / "site-packages")
    packages = bundle_root / "node" / "packages"
    node_modules = node_root / "node_modules"
    tarballs = sorted(packages.glob("*.tgz")) if packages.is_dir() else []
    if tarballs:
        node_modules.mkdir(parents=True, exist_ok=True)
        for archive in tarballs:
            _extract_npm_pack(archive, node_modules)

    write_hermes_launcher(dest / "bin" / "hermes.exe")
    _copy_endpoint_scripts(dest / "scripts")
    runtime_dir = dest / "runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)
    for name in ("runtime-build.json", "runtime-profile.json"):
        src = bundle_root / name
        if src.is_file():
            shutil.copy2(src, runtime_dir / name)
    metadata = {
        "schema": "smc.hermes.windows-runtime.v1",
        "python": python_version,
        "node": node_version,
        "platform": "windows",
        "architecture": "amd64",
    }
    (runtime_dir / "windows-runtime.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    assert_pe_amd64(dest / "bin" / "hermes.exe")
    assert_pe_amd64(python_root / "python.exe")
    assert_pe_amd64(node_root / "node.exe")
    if not (python_root / "Lib" / "site-packages").is_dir():
        raise ValueError("site-packages missing")
    return dest
