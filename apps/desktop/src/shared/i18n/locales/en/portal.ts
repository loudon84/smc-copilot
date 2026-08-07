export default {
  noServices: "No runtime services registered",
  webAppPlaceholder: "Portal Web App will load here when the runtime is ready.",
  webAppHint: "The Portal frontend is served via a local WebContentsView once all services are running.",
  loadingRuntime: "Checking Portal runtime…",
  supervisorFrontendDown:
    "Desktop-managed Portal frontend is not running. Still loading your configured portal URL.",
  portalUnreachable:
    "Configured Portal Home URL is not reachable: {{url}}. Start your local frontend (e.g. pnpm dev) or check the login endpoint.",
  openRuntimeSettings: "Runtime settings",
  portalRuntimeTitle: "Portal runtime",
  portalRuntimeHint:
    "Portal Backend (:8000) and Frontend (:3000) are separate from Hermes Gateway. The desktop can start them when the Portal monorepo is available; you can also run pnpm dev at the repo root. PostgreSQL is required (default 127.0.0.1:55432).",
  portalRuntimeApiMissing: "aiosRuntime API is unavailable (preload not loaded)",
  startPortal: "Start Portal",
  startingPortal: "Starting…",
  stopPortal: "Stop",
  restartPortal: "Restart",
  portalDoctor: "Doctor",
  portalInstallStatusLabel: "Install status",
  portalInstalled: "Installed",
  portalNotInstalled: "Not installed",
  portalRootLabel: "Monorepo root",
  portalNotInstalledHint:
    "Run build/scripts/deploy-copilot-serve.ps1 to clone Portal into runtime/portal/src, or set user env COPILOT_PORTAL_ROOT to a valid monorepo path (package.json + backend/ + frontend/). Restart the desktop app after deploy.",
} as const;
