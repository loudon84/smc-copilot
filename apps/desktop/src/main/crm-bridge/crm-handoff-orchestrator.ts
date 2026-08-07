import type {
  CrmBridgeResult,
  CrmBridgeStoredEvent,
} from "../../shared/crm-bridge/crm-bridge-contract";
import type { BrowserViewPort } from "../browser/browser-viewport";
import { dispatchCrmCommand } from "./crm-command-dispatcher";
import {
  findPendingCrmHandoffByUrl,
  markCrmHandoffStatus,
  normalizeCrmUrl,
} from "./crm-handoff-store";

export async function handleCrmPageReadyForHandoff(input: {
  readyEvent: CrmBridgeStoredEvent;
  viewManager: BrowserViewPort;
}): Promise<CrmBridgeResult & { handoffId?: string; data?: unknown }> {
  const normalizedUrl = normalizeCrmUrl(input.readyEvent.page.url);
  const handoff = findPendingCrmHandoffByUrl(normalizedUrl);

  if (!handoff) {
    return {
      ok: true,
      requestId: input.readyEvent.requestId,
      action: "crm.handoff.none",
      message: "No pending CRM handoff for page",
    };
  }

  markCrmHandoffStatus(handoff.handoffId, "delivering");

  const pushResult = await dispatchCrmCommand(
    {
      commandId: `crm_push_${handoff.handoffId}`,
      type: "desktop.crm.pushJson",
      payload: {
        handoffId: handoff.handoffId,
        schema: handoff.schema,
        entityType: handoff.entityType,
        entityId: handoff.entityId,
        data: handoff.data,
      },
      expectAck: true,
      timeoutMs: 8000,
      createdAt: new Date().toISOString(),
    },
    input.viewManager,
  );

  if (!pushResult.ok) {
    markCrmHandoffStatus(handoff.handoffId, "failed", pushResult.message);
    return {
      ...pushResult,
      handoffId: handoff.handoffId,
      action: "crm.handoff.failed",
    };
  }

  const actionResult = await dispatchCrmCommand(
    {
      commandId: `crm_action_${handoff.handoffId}`,
      type: "desktop.crm.runAction",
      target: {
        actionKey: handoff.actionKey,
        entityId: handoff.entityId,
      },
      payload: {
        handoffId: handoff.handoffId,
        schema: handoff.schema,
        entityType: handoff.entityType,
        entityId: handoff.entityId,
      },
      expectAck: true,
      timeoutMs: 12000,
      createdAt: new Date().toISOString(),
    },
    input.viewManager,
  );

  if (!actionResult.ok) {
    markCrmHandoffStatus(handoff.handoffId, "failed", actionResult.message);
    return {
      ...actionResult,
      handoffId: handoff.handoffId,
      action: "crm.handoff.failed",
    };
  }

  markCrmHandoffStatus(handoff.handoffId, "delivered");

  return {
    ok: true,
    requestId: input.readyEvent.requestId,
    handoffId: handoff.handoffId,
    action: "crm.handoff.delivered",
    message: "CRM handoff delivered",
    data: actionResult.data,
  };
}
