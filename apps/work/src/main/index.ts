import { app } from "electron";
import { applyGpuPreferences, installGpuCrashGuard } from "./gpu-fallback";
import { startMainProcess } from "./app/start";
import { loadDotEnvForDev } from "./load-env";
import { registerArtifactSchemePrivileged } from "./artifact-protocol";

// Dev only: make process.env reflect the project `.env` so runtime env reads
// (e.g. the SMC Copilot API endpoint) pick up edits on relaunch without a
// rebuild. Packaged builds carry their config baked in and ship no `.env`.
if (!app.isPackaged) loadDotEnvForDev();

applyGpuPreferences();
installGpuCrashGuard();

// Must run before app ready so hermes-artifact:// is privileged.
registerArtifactSchemePrivileged();

if (process.env.ENABLE_CDP === "1") {
  app.commandLine.appendSwitch(
    "remote-debugging-port",
    process.env.CDP_PORT || "9222",
  );
}

startMainProcess();
