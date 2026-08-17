"""Windows AMD64 Python wheelhouse inventory and fail-closed platform checks."""

from __future__ import annotations

import hashlib
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

WHEEL_RE = re.compile(
    r"^(?P<name>.+)-(?P<version>[^-]+)-(?P<python>[^-]+)-(?P<abi>[^-]+)-(?P<plat>.+)\.whl$",
    re.I,
)


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def classify_wheel(filename: str) -> dict[str, str]:
    match = WHEEL_RE.match(Path(filename).name)
    if not match:
        raise ValueError(f"unrecognized wheel name: {filename}")
    return match.groupdict()


def assert_windows_amd64_wheel(filename: str) -> None:
    info = classify_wheel(filename)
    plat = info["plat"].lower()
    if plat in {"any", "py3-none-any"} or plat.endswith("any"):
        return
    if "manylinux" in plat or "linux" in plat or "macosx" in plat or "darwin" in plat:
        raise ValueError(f"wrong platform wheel: {filename}")
    if "win_arm64" in plat or plat == "win32":
        raise ValueError(f"wrong platform wheel: {filename}")
    if "win_amd64" not in plat:
        raise ValueError(f"wrong platform wheel: {filename}")
    abi = info["abi"].lower()
    py_tag = info["python"].lower()
    if "cp" in py_tag and "cp312" not in py_tag and abi not in {"none", "abi3"}:
        raise ValueError(f"wrong python abi wheel: {filename}")


def inventory_wheels(wheelhouse: Path) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for path in sorted(wheelhouse.glob("*.whl")):
        assert_windows_amd64_wheel(path.name)
        info = classify_wheel(path.name)
        items.append(
            {
                "name": info["name"],
                "version": info["version"],
                "filename": path.name,
                "sha256": sha256_file(path),
                "platform": info["plat"],
            }
        )
    if not items:
        raise ValueError("python wheelhouse empty")
    return items


def wheelhouse_digest(items: list[dict[str, Any]]) -> str:
    payload = "\n".join(f"{item['filename']}|{item['sha256']}" for item in items)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def write_requirements_lock(dest: Path, items: list[dict[str, Any]]) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    lines = [f"{item['filename']} sha256={item['sha256']}" for item in items]
    dest.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return dest


def verify_required_wheels(items: list[dict[str, Any]], required_names: list[str]) -> None:
    present = {item["name"].replace("-", "_").lower() for item in items}
    for name in required_names:
        key = name.replace("-", "_").lower()
        if key not in present:
            raise ValueError(f"missing python dependency: {name}")


def download_wheelhouse(repo: Path, dest: Path, extras: list[str]) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    uv = shutil.which("uv")
    extra_args: list[str] = []
    for extra in extras:
        extra_args.extend(["--extra", extra])
    if uv:
        cmd = [
            uv,
            "pip",
            "download",
            "--python-platform",
            "x86_64-pc-windows-msvc",
            "--python-version",
            "3.12",
            "--only-binary",
            ":all:",
            "-d",
            str(dest),
            ".",
            *extra_args,
        ]
    else:
        cmd = [
            "python",
            "-m",
            "pip",
            "download",
            "--only-binary",
            ":all:",
            "--platform",
            "win_amd64",
            "--python-version",
            "3.12",
            "-d",
            str(dest),
            ".",
        ]
    result = subprocess.run(cmd, cwd=repo, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise ValueError(result.stderr.strip() or result.stdout.strip() or "wheelhouse download failed")
    return dest
