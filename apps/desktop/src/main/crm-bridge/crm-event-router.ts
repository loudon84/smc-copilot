import type { WebContents } from "electron";
import type {
  CrmBridgeEvent,
  CrmBridgeRouteResult,
} from "../../shared/crm-bridge/crm-bridge-contract";
import { getCrmBridgeConfig } from "./crm-bridge-config";
import type { BrowserController } from "../browser/browser-controller";

export interface RouteCrmBridgeEventParams {
  sender: WebContents;
  event: CrmBridgeEvent;
  controller: BrowserController;
  mainWindow: Electron.BrowserWindow | null;
}

export async function routeCrmBridgeEvent(
  params: RouteCrmBridgeEventParams,
): Promise<CrmBridgeRouteResult> {
  const config = getCrmBridgeConfig();
  const route = config.routes[params.event.type];

  if (!route) {
    return {
      ok: false,
      message: "No route configured for event type",
    };
  }

  if (route.action === "refresh-snapshot" || route.refreshSnapshot) {
    try {
      await params.controller.capturePageSnapshot({
        includeFrames: true,
        includeInteractiveElements: true,
      });
    } catch {
      // snapshot failure should not block routing
    }
  }

  if (route.action === "open-web-operator-panel") {
    return {
      ok: true,
      action: route.action,
      focusedPanel: route.focusedPanel ?? "page-structure",
      refreshSnapshot: route.refreshSnapshot ?? false,
    };
  }

  if (route.action === "open-renderer-route") {
    return {
      ok: true,
      action: route.action,
      route: route.route,
    };
  }

  if (route.action === "refresh-snapshot") {
    return {
      ok: true,
      action: route.action,
      refreshSnapshot: true,
      focusedPanel: route.focusedPanel,
    };
  }

  return {
    ok: false,
    message: "Unknown route action",
  };
}
