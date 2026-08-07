import type { BrowserWindow } from "electron";
import type {
  HostBridgeRouteResult,
  HostBridgeSubmitEvent,
} from "../../shared/crm-bridge/host-bridge-contract";
import { resolveHostBridgeRoute } from "./host-bridge-config";
import type { BrowserController } from "../browser/browser-controller";
import { handleHostSubmitForHandoff } from "./host-handoff-orchestrator";

export interface RouteHostBridgeEventParams {
  event: HostBridgeSubmitEvent;
  controller: BrowserController;
  mainWindow: BrowserWindow | null;
}

export async function routeHostBridgeEvent(
  params: RouteHostBridgeEventParams,
): Promise<HostBridgeRouteResult> {
  const route = resolveHostBridgeRoute(
    params.event.formType,
    params.event.action,
    params.event.skillName,
  );

  if (!route) {    
    return {
      ok: true,
      action: "open-web-operator-panel",
      focusedPanel: "host-context",
    };    
  }

  if (route.refreshSnapshot) {
    try {
      await params.controller.capturePageSnapshot({
        includeFrames: true,
        includeInteractiveElements: true,
      });
    } catch {
      // non-blocking
    }
  }

  if (route.callbackMode === "open-tab-fill-form") {
    const handoffResult = await handleHostSubmitForHandoff(params.event);
    return {
      ok: handoffResult.ok,
      action: handoffResult.action ?? route.desktopAction,
      focusedPanel: route.focusedPanel ?? "host-context",
      callbackMode: route.callbackMode,
      message: handoffResult.message,
    };
  }

  if (route.desktopAction === "open-web-operator-panel") {
    return {
      ok: true,
      action: route.desktopAction,
      focusedPanel: route.focusedPanel ?? "host-context",
      refreshSnapshot: route.refreshSnapshot ?? false,
    };
  }

  if (route.desktopAction === "open-hermes-skill") {
    return {
      ok: true,
      action: route.desktopAction,
      focusedPanel: route.focusedPanel ?? "host-context",
      message: route.skillName,
    };
  }

  if (route.desktopAction === "open-renderer-route") {
    return {
      ok: true,
      action: route.desktopAction,
      route: route.route,
      focusedPanel: route.focusedPanel,
    };
  }

  return { ok: false, message: "Unknown route desktopAction" };
}
