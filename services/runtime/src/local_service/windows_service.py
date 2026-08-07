from __future__ import annotations

"""Windows Service host for smc-copilot-serve.

EXPERIMENTAL — not the v1.4 default deployment path.

Production Windows installs use Task Scheduler ONLOGON for the current user with
LIMITED privileges (see local_service.windows_user_daemon). LocalSystem service
mode breaks DPAPI secrets, HERMES_HOME, Profile paths, and user-session context.

This module is retained for advanced/admin scenarios only.
"""

import sys
import threading

from local_service.runner import request_shutdown, run_local_service

if sys.platform == "win32":
    import servicemanager  # type: ignore[import-untyped]
    import win32service  # type: ignore[import-untyped]
    import win32serviceutil  # type: ignore[import-untyped]

    class HermesLocalWindowsService(win32serviceutil.ServiceFramework):
        _svc_name_ = "HermesLocalService"
        _svc_display_name_ = "Hermes Local Service (experimental)"
        _svc_description_ = (
            "EXPERIMENTAL LocalSystem service for smc-copilot-serve. "
            "Default v1.4 installs use per-user Task Scheduler (windows_user_daemon)."
        )

        def __init__(self, args: list[str]) -> None:
            win32serviceutil.ServiceFramework.__init__(self, args)
            self._worker: threading.Thread | None = None

        def SvcStop(self) -> None:  # noqa: N802
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            request_shutdown()
            if self._worker is not None:
                self._worker.join(timeout=30.0)
            self.ReportServiceStatus(win32service.SERVICE_STOPPED)

        def SvcDoRun(self) -> None:  # noqa: N802
            servicemanager.LogMsg(
                servicemanager.EVENTLOG_INFORMATION_TYPE,
                servicemanager.PYS_SERVICE_STARTED,
                (self._svc_name_, ""),
            )
            self.ReportServiceStatus(win32service.SERVICE_START_PENDING)
            self.ReportServiceStatus(win32service.SERVICE_RUNNING)

            self._worker = threading.Thread(
                target=run_local_service,
                name="hermes-local-uvicorn",
                daemon=False,
            )
            self._worker.start()
            self._worker.join()

            servicemanager.LogMsg(
                servicemanager.EVENTLOG_INFORMATION_TYPE,
                servicemanager.PYS_SERVICE_STOPPED,
                (self._svc_name_, ""),
            )

else:

    class HermesLocalWindowsService:  # type: ignore[no-redef]
        _svc_name_ = "HermesLocalService"
        _svc_display_name_ = "Hermes Local Service"
        _svc_description_ = "Local API and Hermes gateway supervisor for smc-copilot desktop"


def main() -> None:
    if sys.platform != "win32":
        raise RuntimeError("Windows service is only supported on win32")
    win32serviceutil.HandleCommandLine(HermesLocalWindowsService)


if __name__ == "__main__":
    main()
