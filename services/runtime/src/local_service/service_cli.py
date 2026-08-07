from __future__ import annotations

import argparse
import ctypes
import sys


def _is_admin() -> bool:
    if sys.platform != "win32":
        return False
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def _require_windows() -> None:
    if sys.platform != "win32":
        raise SystemExit("ai-copilot-service Windows commands require win32")


def _require_pywin32() -> None:
    try:
        import win32serviceutil  # noqa: F401
    except ImportError as exc:
        raise SystemExit(
            "pywin32 is required for service management. Install with: uv sync --extra service"
        ) from exc


def _handle_service_command(command: str) -> None:
    _require_windows()
    _require_pywin32()

    if command == "install" and not _is_admin():
        raise SystemExit("install requires Administrator privileges on Windows")

    import win32serviceutil  # type: ignore[import-untyped]

    from local_service.windows_service import HermesLocalWindowsService

    svc_name = HermesLocalWindowsService._svc_name_

    if command == "status":
        status = win32serviceutil.QueryServiceStatus(svc_name)
        print(f"Service {svc_name}: {status}")
        return

    argv = ["ai-copilot-service", command]
    win32serviceutil.HandleCommandLine(HermesLocalWindowsService, argv=argv)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="ai-copilot-service")
    parser.add_argument(
        "command",
        choices=["install", "start", "stop", "restart", "remove", "status", "run"],
        help="Service management command",
    )
    args = parser.parse_args(argv)

    if args.command == "run":
        from local_service.runner import run_local_service

        run_local_service()
        return

    _handle_service_command(args.command)


if __name__ == "__main__":
    main()
