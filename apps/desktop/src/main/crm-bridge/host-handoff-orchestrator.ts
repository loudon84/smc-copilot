import type { WebContents } from "electron";
import type {
  HostBridgeResult,
  HostBridgeSubmitEvent,
  HostBridgeStoredReadyEvent,
  HostHandoffStatus,
} from "../../shared/crm-bridge/host-bridge-contract";
import { dispatchHostCommand } from "./host-command-dispatcher";
import {
  createHostHandoff,
  findPendingHostHandoffByUrl,
  markHostHandoffStatus,
} from "./host-handoff-store";
import { runHostSkill } from "./host-skill-runner";
import {
  findWebOperatorTabByWebContentsId,
  openHostCallbackTab,
  webOperatorTabLayerId,
} from "../browser/web-operator-tabs";

const HANDOFF_DELIVER_RETRY_STATUSES: HostHandoffStatus[] = [
  "callback-loaded",
  "ready-received",
  "delivering",
];

async function deliverHostHandoffFill(
  handoff: NonNullable<ReturnType<typeof findPendingHostHandoffByUrl>>,
  tabLayerId: string | null,
): Promise<HostBridgeResult & { data?: unknown }> {
  const commandId =
    handoff.commandId ?? `host_fill_${handoff.handoffId}_${Date.now()}`;
  markHostHandoffStatus(handoff.handoffId, "delivering", undefined, { commandId });

  const fillResult = await dispatchHostCommand(
    {
      commandId,
      type: "desktop.host.form.fill",
      formType: handoff.formType,
      action: handoff.action,
      payload: handoff.fillFormPayload,
      createdAt: new Date().toISOString(),
      expectAck: true,
      timeoutMs: 12000,
    },
    tabLayerId,
  );

  if (!fillResult.ok) {
    markHostHandoffStatus(handoff.handoffId, "failed", fillResult.message);
    return fillResult;
  }

  markHostHandoffStatus(handoff.handoffId, "delivered");
  return fillResult;
}

function resolveHandoffTabLayerId(
  handoff: NonNullable<ReturnType<typeof findPendingHostHandoffByUrl>>,
  webContents: WebContents,
): string | null {
  if (handoff.tabId) {
    return webOperatorTabLayerId(handoff.tabId);
  }

  const tab = findWebOperatorTabByWebContentsId(webContents.id);
  if (tab) {
    return webOperatorTabLayerId(tab.tabId);
  }

  return null;
}

/** 页面加载并注入 JSSDK 后重试 handoff 填表（callback 页签常未挂注入器）。 */
export async function tryDeliverHostHandoffAfterPageLoad(
  webContents: WebContents,
): Promise<void> {
  if (webContents.isDestroyed()) return;

  const url = webContents.getURL();
  if (!url || url === "about:blank") return;

  const handoff = findPendingHostHandoffByUrl(url);
  if (!handoff || !HANDOFF_DELIVER_RETRY_STATUSES.includes(handoff.status)) {
    return;
  }

  if (handoff.status === "callback-loaded") {
    markHostHandoffStatus(handoff.handoffId, "ready-received");
  }

  const tabLayerId = resolveHandoffTabLayerId(handoff, webContents);
  const fillResult = await deliverHostHandoffFill(handoff, tabLayerId);

  if (!fillResult.ok) {
    console.warn(
      "[HOST-BRIDGE] Handoff auto-deliver failed:",
      fillResult.message,
      url,
    );
  }
}

export async function handleHostSubmitForHandoff(
  event: HostBridgeSubmitEvent,
): Promise<HostBridgeResult & { handoffId?: string; action?: string }> {
  if (event.action !== "create" && event.action !== "edit") {
    return {
      ok: true,
      requestId: event.requestId,
      action: "host.handoff.skipped",
      message: "Handoff not required for action",
    };
  }

  if (!event.callbackUrl) {
    return {
      ok: false,
      requestId: event.requestId,
      errorCode: "INVALID_SCHEMA",
      message: "callbackUrl is required for create/edit",
    };
  }

  const skillResult = await runHostSkill(event);
  if (!skillResult.ok || !skillResult.fillFormPayload) {
    return {
      ok: false,
      requestId: event.requestId,
      errorCode: (skillResult.errorCode as HostBridgeResult["errorCode"]) ?? "UNKNOWN_ERROR",
      message: skillResult.message ?? "Skill runner failed",
    };
  }

  const handoff = createHostHandoff({
    sourceEvent: event,
    fillFormPayload: skillResult.fillFormPayload,
    skillName: skillResult.skillName,
  });

  markHostHandoffStatus(handoff.handoffId, "callback-opening");

  try {
    const tab = await openHostCallbackTab({
      requestId: event.requestId,
      formType: event.formType,
      action: event.action,
      callbackUrl: event.callbackUrl,
      handoffId: handoff.handoffId,
    });

    markHostHandoffStatus(handoff.handoffId, "callback-loaded", undefined, {
      tabId: tab.tabId,
    });

    return {
      ok: true,
      requestId: event.requestId,
      handoffId: handoff.handoffId,
      action: "host.handoff.tab-opened",
      message: `Opened callback tab ${tab.title}`,
      data: { tabId: tab.tabId },
    };
  } catch (error) {
    markHostHandoffStatus(
      handoff.handoffId,
      "failed",
      error instanceof Error ? error.message : String(error),
    );
    return {
      ok: false,
      requestId: event.requestId,
      handoffId: handoff.handoffId,
      errorCode: "WEB_OPERATOR_NOT_READY",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleHostPageReady(
  readyEvent: HostBridgeStoredReadyEvent,
): Promise<HostBridgeResult & { handoffId?: string; action?: string }> {
  const normalizedUrl = readyEvent.pageContext.url;
  const handoff = findPendingHostHandoffByUrl(normalizedUrl);

  if (!handoff) {
    return {
      ok: true,
      requestId: readyEvent.requestId,
      action: "host.handoff.none",
      message: "No pending Host handoff for page",
    };
  }

  markHostHandoffStatus(handoff.handoffId, "ready-received");

  const tabLayerId =
    handoff.tabId && handoff.tabId !== "default"
      ? webOperatorTabLayerId(handoff.tabId)
      : handoff.tabId === "default"
        ? webOperatorTabLayerId("default")
        : null;

  const fillResult = await deliverHostHandoffFill(handoff, tabLayerId);

  if (!fillResult.ok) {
    return {
      ...fillResult,
      handoffId: handoff.handoffId,
      action: "host.handoff.failed",
    };
  }

  return {
    ok: true,
    requestId: readyEvent.requestId,
    handoffId: handoff.handoffId,
    action: "host.handoff.delivered",
    message: "Host handoff delivered",
    data: fillResult.data,
  };
}
