import type { BrowserWindow } from "electron";
import type { BrowserController } from "../browser/browser-controller";
import type { BrowserViewPort } from "../browser/browser-viewport";
import type { ShellViewManager } from "../shell/views/shell-view-manager";
import { HostBridgeIPC } from "./host-bridge-ipc";
import { getHostBridgeConfig } from "./host-bridge-config";
import { setupCrmLitePageInjector, setCrmBridgeHealthContext } from "./crm-lite-page-injector";
import { registerWebOperatorCrmPreloadSession } from "./register-web-operator-preload";
import { ensureWebOperatorBridgeHealth } from "./web-operator-bridge-health";
import {
  initWebOperatorTabManager,
  registerWebOperatorTabsIpc,
  unregisterWebOperatorTabsIpc,
} from "../browser/web-operator-tabs";

let hostBridgeIPC: HostBridgeIPC | null = null;

export function setupCrmBridge(
  controller: BrowserController,
  viewManager: BrowserViewPort,
  mainWindow: BrowserWindow,
  shellViewManager?: ShellViewManager,
): void {
  const hostConfig = getHostBridgeConfig();
  if (!hostConfig.enabled) {
    console.log("[HOST-BRIDGE] Disabled by configuration");
    return;
  }

  registerWebOperatorCrmPreloadSession();

  if (shellViewManager) {
    initWebOperatorTabManager(shellViewManager, () =>
      mainWindow.isDestroyed() ? null : mainWindow,
    );
    registerWebOperatorTabsIpc();
  }

  hostBridgeIPC = new HostBridgeIPC(controller, () =>
    mainWindow.isDestroyed() ? null : mainWindow,
  );
  hostBridgeIPC.register();

  setupCrmLitePageInjector(viewManager, shellViewManager);

  if (shellViewManager) {
    setCrmBridgeHealthContext(shellViewManager, viewManager);
    void ensureWebOperatorBridgeHealth(shellViewManager, viewManager);
  }

  console.log("[HOST-BRIDGE] IPC registered (v6.0 + legacy crm-bridge)");
}

export function teardownCrmBridge(): void {
  hostBridgeIPC?.unregister();
  hostBridgeIPC = null;
  unregisterWebOperatorTabsIpc();
}

export {
  getCrmBridgeConfig,
  reloadCrmBridgeConfig,
} from "./crm-bridge-config";
export {
  getHostBridgeConfig,
  reloadHostBridgeConfig,
  getHostBridgeConfigPath,
  openHostBridgeConfigFile,
} from "./host-bridge-config";
