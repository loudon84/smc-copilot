from __future__ import annotations

"""Windows user-level daemon: register logon Task Scheduler task (no admin)."""

import argparse
import os
import subprocess
import sys
from pathlib import Path


TASK_NAME = "HermesRuntimeUserDaemon"


def _python_exe() -> str:
    return sys.executable


def _serve_command() -> list[str]:
    # Prefer uvicorn entry used by the project
    root = Path(__file__).resolve().parents[2]
    return [
        _python_exe(),
        "-m",
        "uvicorn",
        "main:app",
        "--app-dir",
        str(root / "src"),
        "--host",
        "127.0.0.1",
        "--port",
        os.environ.get("RUNTIME_PORT", "8765"),
    ]


def install_logon_task() -> None:
    cmd = _serve_command()
    # schtasks /Create /TN ... /TR "..." /SC ONLOGON /RL LIMITED
    tr = subprocess.list2cmdline(cmd)
    args = [
        "schtasks",
        "/Create",
        "/F",
        "/TN",
        TASK_NAME,
        "/TR",
        tr,
        "/SC",
        "ONLOGON",
        "/RL",
        "LIMITED",
    ]
    subprocess.run(args, check=True)


def uninstall_logon_task() -> None:
    subprocess.run(["schtasks", "/Delete", "/F", "/TN", TASK_NAME], check=False)


def status() -> int:
    result = subprocess.run(
        ["schtasks", "/Query", "/TN", TASK_NAME],
        capture_output=True,
        text=True,
        check=False,
    )
    print(result.stdout or result.stderr)
    return result.returncode


def detect_port_conflict(port: int = 8765) -> bool:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Hermes Runtime Windows user daemon")
    parser.add_argument("action", choices=["install", "uninstall", "status", "check-port"])
    parser.add_argument("--port", type=int, default=int(os.environ.get("RUNTIME_PORT", "8765")))
    args = parser.parse_args(argv)
    if args.action == "install":
        if detect_port_conflict(args.port):
            print(f"Port {args.port} already in use; refuse to install user daemon alongside another listener")
            return 2
        install_logon_task()
        print(f"Installed Task Scheduler task: {TASK_NAME}")
        return 0
    if args.action == "uninstall":
        uninstall_logon_task()
        print(f"Removed Task Scheduler task: {TASK_NAME}")
        return 0
    if args.action == "status":
        return status()
    if args.action == "check-port":
        busy = detect_port_conflict(args.port)
        print("busy" if busy else "free")
        return 1 if busy else 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
