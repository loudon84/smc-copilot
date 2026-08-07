/**
 * Applies remote desktop bootstrap config (PRD §13).
 * Commits local cache + bootstrap-state only after all steps succeed.
 * Enterprise install is not re-run here — see user-config-applier-hermes.ts.
 */
import { saveAiOsEnvConfig, writeAiOsEnvFile } from "../aios/aios-config";
import { isAiOsInstalled } from "../aios/aios-paths";
import { startAiOs } from "../aios/aios-runtime-supervisor";
import { reconcileAiOsRuntime } from "../aios/aios-reconciler";
import { writeAuthEndpointConfig } from "../auth/auth-endpoint-config-store";
import { updateTokenInjectionPolicy } from "../auth/token-injection-policy";
import { readStoredSession } from "../auth/token-store";
import { restartGateway } from "../hermes";
import type { BrowserWindow } from "electron";
import type { DesktopBootstrapConfig } from "../../shared/user-config/user-config-contract";
import { writeBootstrapState, writeLocalBootstrapConfig } from "./user-config-store";
import { applyHermesBootstrapConfig } from "./user-config-applier-hermes";
import { captureApplySnapshot, restoreApplySnapshot } from "./user-config-rollback";

function applyAiOsEnv(remote: DesktopBootstrapConfig): void {
  const homeUrl = remote.aios.aiosHomeUrl ?? remote.aios.frontendUrl ?? "";
  const aiosPortMatch = homeUrl.match(/:(\d+)/);
  const backendPortMatch = remote.aios.backendUrl.match(/:(\d+)/);
  saveAiOsEnvConfig({
    frontendPort: aiosPortMatch ? Number(aiosPortMatch[1]) : undefined,
    backendPort: backendPortMatch ? Number(backendPortMatch[1]) : undefined,
  });
  // Defer .env.desktop.local until ai-os-full is installed (startAiOs also writes it)
  if (isAiOsInstalled()) {
    writeAiOsEnvFile();
  }
}

export async function applyUserConfig(
  remote: DesktopBootstrapConfig,
  mainWindow: BrowserWindow | null,
): Promise<void> {
  const snapshot = captureApplySnapshot();

  try {
    await applyHermesBootstrapConfig(remote);
    applyAiOsEnv(remote);

    await reconcileAiOsRuntime();

    if (remote.aios.autoStart && mainWindow) {
      try {
        await startAiOs(mainWindow);
      } catch (err) {
        console.warn("[user-config] autoStart Portal failed:", err);
      }
    }

    try {
      restartGateway(remote.hermes.activeProfile);
    } catch (err) {
      console.warn("[user-config] restartGateway after apply:", err);
    }

    const endpoint = writeAuthEndpointConfig({
      backendUrl: remote.aios.backendUrl,
      authPrefix: remote.aios.authPrefix,
      aiosHomeUrl: remote.aios.aiosHomeUrl ?? remote.aios.frontendUrl ?? "",
    });
    const session = await readStoredSession();
    updateTokenInjectionPolicy(endpoint, Boolean(session?.accessToken));

    writeLocalBootstrapConfig(remote);
    writeBootstrapState({
      initialized: true,
      lastConfigHash: remote.configHash,
      lastConfigVersion: remote.configVersion,
      lastAppliedAt: new Date().toISOString(),
    });
  } catch (err) {
    restoreApplySnapshot(snapshot);
    throw err;
  }
}
