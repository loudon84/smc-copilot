import type { BrowserViewPort } from "../browser/browser-viewport";
import type { ShellViewManager } from "../shell/views/shell-view-manager";
import { WEB_OPERATOR_LAYER_ID } from "../browser/shell-browser-view-adapter";
import { registerWebOperatorCrmPreloadSession } from "./register-web-operator-preload";

const BRIDGE_PROBE =
  "Boolean(window.CopilotDesktopCRM && typeof window.CopilotDesktopCRM.emit === 'function')";

export async function ensureWebOperatorBridgeHealth(
  shellViewManager: ShellViewManager,
  viewManager: BrowserViewPort,
): Promise<void> {
  registerWebOperatorCrmPreloadSession();

  const wc = viewManager.getExternalWebContents();
  if (!wc || wc.isDestroyed()) {
    console.log("[CRM-BRIDGE] web-operator view not created yet; preload session is ready");
    return;
  }

  let hasBridge = false;
  try {
    hasBridge = await wc.executeJavaScript(BRIDGE_PROBE, true);
  } catch (error) {
    console.warn("[CRM-BRIDGE] Bridge probe failed:", error);
  }

  if (hasBridge) {
    console.log("[CRM-BRIDGE] CopilotDesktopCRM is available on web-operator");
    return;
  }

  const currentUrl = wc.getURL() || "about:blank";
  console.warn(
    "[CRM-BRIDGE] CopilotDesktopCRM missing on web-operator — recreating view for",
    currentUrl,
  );

  shellViewManager.destroyView(WEB_OPERATOR_LAYER_ID);

  if (currentUrl !== "about:blank" && currentUrl.startsWith("http")) {
    try {
      await viewManager.createView(currentUrl);
      const recreated = viewManager.getExternalWebContents();
      if (recreated && !recreated.isDestroyed()) {
        const ok = await recreated.executeJavaScript(BRIDGE_PROBE, true);
        console.log("[CRM-BRIDGE] Bridge available after recreate:", ok);
      }
    } catch (error) {
      console.error("[CRM-BRIDGE] Failed to recreate web-operator view:", error);
    }
  }
}
