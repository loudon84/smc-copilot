from __future__ import annotations

"""Windows user-level daemon: register logon Task Scheduler task (no admin)."""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


TASK_NAME = "HermesRuntimeUserDaemon"
DEFAULT_PORT = 8765
HEALTH_PATH = "/api/v1/health"
PORT_WAIT_SECONDS = 30.0
HEALTH_WAIT_SECONDS = 60.0


def _python_exe() -> str:
    return sys.executable


def _serve_command() -> list[str]:
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
        os.environ.get("RUNTIME_PORT", str(DEFAULT_PORT)),
    ]


def detect_port_conflict(port: int = DEFAULT_PORT) -> bool:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def check_runtime_health(port: int = DEFAULT_PORT) -> bool:
    url = f"http://127.0.0.1:{port}{HEALTH_PATH}"
    try:
        with urllib.request.urlopen(url, timeout=2) as resp:
            if resp.status != 200:
                return False
            payload = json.loads(resp.read().decode("utf-8"))
            return isinstance(payload, dict) and "version" in payload
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return False


def find_listener_pid(port: int) -> int | None:
    if sys.platform != "win32":
        return None
    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    needle = f":{port}"
    for line in result.stdout.splitlines():
        if "LISTENING" not in line or needle not in line:
            continue
        parts = line.split()
        if not parts:
            continue
        try:
            return int(parts[-1])
        except ValueError:
            continue
    return None


def _process_command_line(pid: int) -> str:
    if sys.platform != "win32":
        return ""
    try:
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                f"(Get-CimInstance Win32_Process -Filter 'ProcessId={pid}').CommandLine",
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""
    return (result.stdout or "").strip()


def is_our_runtime_process(pid: int) -> bool:
    cmd = _process_command_line(pid).lower()
    if not cmd:
        return False
    return "uvicorn" in cmd and "main:app" in cmd


def is_our_runtime_on_port(port: int) -> bool:
    if not detect_port_conflict(port):
        return False
    if check_runtime_health(port):
        return True
    pid = find_listener_pid(port)
    return pid is not None and is_our_runtime_process(pid)


def stop_process(pid: int) -> bool:
    if sys.platform != "win32":
        return False
    result = subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True, check=False)
    return result.returncode == 0


def stop_our_runtime_on_port(port: int) -> bool:
    pid = find_listener_pid(port)
    if pid is None:
        return not detect_port_conflict(port)
    if not is_our_runtime_process(pid):
        return False
    stop_process(pid)
    return wait_for_port_free(port)


def wait_for_port_free(port: int, timeout: float = PORT_WAIT_SECONDS) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not detect_port_conflict(port):
            return True
        time.sleep(0.25)
    return not detect_port_conflict(port)


def wait_for_runtime_health(port: int, timeout: float = HEALTH_WAIT_SECONDS) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if check_runtime_health(port):
            return True
        time.sleep(0.5)
    return check_runtime_health(port)


def install_logon_task() -> None:
    cmd = _serve_command()
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


def start_logon_task() -> None:
    subprocess.run(["schtasks", "/Run", "/TN", TASK_NAME], check=True)


def stop_logon_task() -> None:
    subprocess.run(["schtasks", "/End", "/TN", TASK_NAME], check=False)


def task_registered() -> bool:
    result = subprocess.run(
        ["schtasks", "/Query", "/TN", TASK_NAME],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode == 0


def task_query_text() -> tuple[int, str]:
    result = subprocess.run(
        ["schtasks", "/Query", "/TN", TASK_NAME, "/FO", "LIST", "/V"],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode, (result.stdout or result.stderr or "")


def status_text() -> int:
    code, text = task_query_text()
    print(text)
    return code


def status_json(port: int) -> dict[str, object]:
    registered = task_registered()
    _, task_info = task_query_text()
    busy = detect_port_conflict(port)
    healthy = check_runtime_health(port) if busy else False
    our_runtime = is_our_runtime_on_port(port) if busy else False
    pid = find_listener_pid(port) if busy else None
    return {
        "taskName": TASK_NAME,
        "taskRegistered": registered,
        "port": port,
        "portBusy": busy,
        "runtimeHealthy": healthy,
        "ourRuntime": our_runtime,
        "listenerPid": pid,
        "taskQueryExitCode": 0 if registered else 1,
        "taskInfo": task_info.strip(),
    }


def prepare_port_for_install(port: int, *, replace: bool) -> int | None:
    """Return exit code on failure, or None when port is ready."""
    if not detect_port_conflict(port):
        return None
    if not replace:
        print(f"Port {port} already in use; refuse to install user daemon alongside another listener")
        return 2
    if not is_our_runtime_on_port(port):
        print(f"Port {port} is occupied by a non-Runtime process; cannot install with --replace")
        return 11
    print(f"Stopping existing Runtime on port {port} before UserDaemon install")
    if not stop_our_runtime_on_port(port):
        print(f"Failed to stop existing Runtime on port {port}")
        return 11
    if not wait_for_port_free(port):
        print(f"Timed out waiting for port {port} to become free")
        return 11
    return None


def install_user_daemon(port: int, *, replace: bool) -> int:
    err = prepare_port_for_install(port, replace=replace)
    if err is not None:
        return err
    if replace and task_registered():
        uninstall_logon_task()
    install_logon_task()
    print(f"Installed Task Scheduler task: {TASK_NAME}")
    try:
        start_logon_task()
    except subprocess.CalledProcessError:
        print("Task registered but immediate start failed; it will run at next logon")
        return 0
    if wait_for_runtime_health(port):
        print(f"Runtime healthy on port {port}")
        return 0
    print(f"Task started but Runtime did not become healthy on port {port} within timeout")
    return 12


def stop_user_daemon(port: int) -> int:
    stop_logon_task()
    if detect_port_conflict(port) and is_our_runtime_on_port(port):
        pid = find_listener_pid(port)
        if pid is not None:
            stop_process(pid)
        wait_for_port_free(port, timeout=15.0)
    print(f"Stopped Task Scheduler task: {TASK_NAME}")
    return 0


def restart_user_daemon(port: int) -> int:
    code = stop_user_daemon(port)
    if code != 0:
        return code
    if not task_registered():
        print("Task not registered; run install first")
        return 1
    start_logon_task()
    if wait_for_runtime_health(port):
        print(f"Runtime healthy on port {port}")
        return 0
    return 12


def repair_user_daemon(port: int) -> int:
    print(f"Repairing UserDaemon task: {TASK_NAME}")
    return install_user_daemon(port, replace=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Hermes Runtime Windows user daemon")
    parser.add_argument(
        "action",
        choices=["install", "uninstall", "status", "check-port", "start", "stop", "restart", "repair"],
    )
    parser.add_argument("--replace", action="store_true", help="Replace existing task and stop our Runtime on port")
    parser.add_argument("--json", action="store_true", help="Emit JSON for status action")
    parser.add_argument("--port", type=int, default=int(os.environ.get("RUNTIME_PORT", str(DEFAULT_PORT))))
    args = parser.parse_args(argv)

    if args.action == "install":
        return install_user_daemon(args.port, replace=args.replace)
    if args.action == "uninstall":
        uninstall_logon_task()
        print(f"Removed Task Scheduler task: {TASK_NAME}")
        return 0
    if args.action == "status":
        if args.json:
            print(json.dumps(status_json(args.port), indent=2))
            return 0
        return status_text()
    if args.action == "check-port":
        busy = detect_port_conflict(args.port)
        print("busy" if busy else "free")
        return 1 if busy else 0
    if args.action == "start":
        if not task_registered():
            print("Task not registered; run install first")
            return 1
        start_logon_task()
        return 0 if wait_for_runtime_health(args.port) else 12
    if args.action == "stop":
        return stop_user_daemon(args.port)
    if args.action == "restart":
        return restart_user_daemon(args.port)
    if args.action == "repair":
        return repair_user_daemon(args.port)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
