import { session } from "electron";
import { WEB_OPERATOR_PARTITION } from "../../shared/shell/browser-partitions";
import { assertPreloadExists } from "../utils/preload-paths";

const PRELOAD_SCRIPT_ID = "copilot-crm-bridge-preload";
let registered = false;

export function registerWebOperatorCrmPreloadSession(): string | null {
  if (registered) {
    return assertPreloadExists("crm-bridge-preload.js");
  }

  const preloadPath = assertPreloadExists("crm-bridge-preload.js");
  const webOperatorSession = session.fromPartition(WEB_OPERATOR_PARTITION);

  try {
    webOperatorSession.registerPreloadScript({
      type: "frame",
      id: PRELOAD_SCRIPT_ID,
      filePath: preloadPath,
    });
    registered = true;
    console.log(
      "[CRM-BRIDGE] Session preload registered for",
      WEB_OPERATOR_PARTITION,
      preloadPath,
    );
  } catch (error) {
    console.error("[CRM-BRIDGE] Failed to register session preload:", error);
  }

  return preloadPath;
}
