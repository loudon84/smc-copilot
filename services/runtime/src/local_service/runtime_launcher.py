"""Production Runtime Launcher (PRD v1.6 FR-002).

Resolves install root, locates embeddable Python, injects Runtime env,
starts Uvicorn via ``python -m main``, writes PID, handles stop signal,
and returns explicit exit codes.

Built as PyInstaller onefile (``build/runtime-launcher.spec``).
"""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

EXIT_OK = 0
EXIT_PYTHON_MISSING = 10
EXIT_MAIN_MISSING = 11
EXIT_START_FAILED = 12
EXIT_STOP_TIMEOUT = 13
EXIT_ALREADY_RUNNING = 14


def resolve_install_root(explicit: str | None = None) -> Path:
    if explicit:
        return Path(explicit).expanduser().resolve()
    # PyInstaller onefile extracts to _MEIPASS; prefer next to the .exe
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    # Dev: launcher lives under src/local_service → repo root, or next to bundle layout
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "python" / "python.exe").is_file() or (parent / "runtime" / "src").is_dir():
            return parent
        if (parent / "pyproject.toml").is_file():
            return parent
    return Path.cwd().resolve()


def locate_python(install_root: Path) -> Path:
    candidates = [
        install_root / "python" / "python.exe",
        install_root / "python" / "python",
        Path(sys.executable),
    ]
    for c in candidates:
        if c.is_file():
            return c
    raise FileNotFoundError("embedded python not found")


def build_env(install_root: Path) -> dict[str, str]:
    env = os.environ.copy()
    runtime_src = install_root / "runtime" / "src"
    site = install_root / "site-packages"
    parts = [str(p) for p in (runtime_src, site) if p.is_dir()]
    existing = env.get("PYTHONPATH", "")
    if existing:
        parts.append(existing)
    if parts:
        env["PYTHONPATH"] = os.pathsep.join(parts)
    env["AIOS_RUNTIME_INSTALL_ROOT"] = str(install_root)
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONNOUSERSITE", "1")
    return env


def pid_path(install_root: Path) -> Path:
    data = Path(os.environ.get("LOCALAPPDATA") or install_root) / "HermesRuntime"
    data.mkdir(parents=True, exist_ok=True)
    return data / "runtime.pid"


def write_pid(path: Path, pid: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(str(pid), encoding="utf-8")


def read_pid(path: Path) -> int | None:
    if not path.is_file():
        return None
    try:
        return int(path.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None


def is_pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def stop_runtime(install_root: Path, *, timeout_sec: float = 30.0) -> int:
    path = pid_path(install_root)
    pid = read_pid(path)
    if pid is None or not is_pid_alive(pid):
        path.unlink(missing_ok=True)
        return EXIT_OK
    try:
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                capture_output=True,
                check=False,
            )
        else:
            os.kill(pid, signal.SIGTERM)
    except OSError:
        pass
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if not is_pid_alive(pid):
            path.unlink(missing_ok=True)
            return EXIT_OK
        time.sleep(0.2)
    return EXIT_STOP_TIMEOUT


def start_runtime(
    install_root: Path,
    *,
    extra_args: list[str] | None = None,
    detach: bool = False,
) -> int:
    try:
        py = locate_python(install_root)
    except FileNotFoundError:
        return EXIT_PYTHON_MISSING

    runtime_src = install_root / "runtime" / "src"
    main_candidates = [
        runtime_src / "main.py",
        install_root / "src" / "main.py",
    ]
    if not any(p.is_file() for p in main_candidates):
        # Allow ``python -m main`` when PYTHONPATH already points at src
        if not (runtime_src.is_dir() or (install_root / "src").is_dir()):
            return EXIT_MAIN_MISSING

    env = build_env(install_root)
    path = pid_path(install_root)
    existing = read_pid(path)
    if existing is not None and is_pid_alive(existing):
        return EXIT_ALREADY_RUNNING

    cmd = [str(py), "-m", "main", *(extra_args or [])]
    creationflags = 0
    if sys.platform == "win32" and detach:
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(install_root),
            env=env,
            creationflags=creationflags,
            stdout=subprocess.DEVNULL if detach else None,
            stderr=subprocess.DEVNULL if detach else None,
        )
    except OSError:
        return EXIT_START_FAILED
    write_pid(path, proc.pid)
    if detach:
        return EXIT_OK
    return_code = proc.wait()
    path.unlink(missing_ok=True)
    return int(return_code)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="SMC Copilot Runtime Launcher")
    parser.add_argument("--install-root", default="", help="Bundle install directory")
    parser.add_argument("--stop", action="store_true", help="Stop running Runtime by PID")
    parser.add_argument("--detach", action="store_true", help="Start detached (no console)")
    parser.add_argument("--version", action="store_true", help="Print launcher version")
    parser.add_argument("remainder", nargs=argparse.REMAINDER, help="Args forwarded to main")
    args = parser.parse_args(argv)

    if args.version:
        print("runtime-launcher 1.6.0")
        return EXIT_OK

    root = resolve_install_root(args.install_root or None)
    if args.stop:
        return stop_runtime(root)

    forward = list(args.remainder)
    if forward and forward[0] == "--":
        forward = forward[1:]
    return start_runtime(root, extra_args=forward, detach=args.detach)


if __name__ == "__main__":
    raise SystemExit(main())
