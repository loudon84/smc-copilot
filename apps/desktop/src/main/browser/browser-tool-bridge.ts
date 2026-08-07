import { randomUUID } from "crypto";
import type { BrowserActionResult } from "../../shared/browser/browser-contract";
import { BrowserController } from "./browser-controller";
import type { BrowserViewPort } from "./browser-viewport";
import { browserToolSchemas } from "../../shared/browser/browser-tool-schema";
import { dispatchCrmCommand } from "../crm-bridge/crm-command-dispatcher";
import { getLastCrmBridgeEvent } from "../crm-bridge/crm-event-store";
import { createCrmHandoff, markCrmHandoffStatus } from "../crm-bridge/crm-handoff-store";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class BrowserToolBridge {
  private controller: BrowserController;
  private viewManager: BrowserViewPort;

  constructor(controller: BrowserController, viewManager: BrowserViewPort) {
    this.controller = controller;
    this.viewManager = viewManager;
  }

  async handleToolCall(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<BrowserActionResult & { data?: unknown }> {
    switch (toolName) {
      case "browser.open": {
        const url = params.url as string;
        if (!url) return { ok: false, message: "Missing required parameter: url" };
        const result = await this.controller.openExternalUrl({ url, source: "hermes" });
        return result;
      }
      case "browser.get_state": {
        const result = await this.controller.getPageState("hermes");
        return { ...result, data: result.state };
      }
      case "browser.screenshot": {
        const result = await this.controller.captureScreenshot("hermes");
        return {
          ok: result.ok,
          errorCode: result.errorCode,
          message: result.message,
          data: result.base64
            ? { mimeType: result.mimeType, base64: result.base64 }
            : undefined,
        };
      }
      case "browser.click": {
        const selector = params.selector as string;
        if (!selector) return { ok: false, message: "Missing required parameter: selector" };
        const result = await this.controller.clickSelector({ selector, source: "hermes" });
        return result;
      }
      case "browser.type": {
        const selector = params.selector as string;
        const text = params.text as string;
        if (!selector || text === undefined) {
          return { ok: false, message: "Missing required parameters: selector, text" };
        }
        const result = await this.controller.typeIntoSelector({ selector, text, source: "hermes" });
        return result;
      }
      case "browser.back": {
        return this.controller.goBack("hermes");
      }
      case "browser.forward": {
        return this.controller.goForward("hermes");
      }
      case "browser.reload": {
        return this.controller.reload("hermes");
      }
      case "browser.extract_table": {
        const selector = params.selector as string;
        if (!selector) return { ok: false, message: "Missing required parameter: selector" };
        return this.controller.extractTable({ selector, source: "hermes" });
      }
      case "crm.get_context": {
        const lastEvent = getLastCrmBridgeEvent();
        if (!lastEvent) {
          return { ok: false, message: "No CRM context event received" };
        }
        return { ok: true, data: lastEvent };
      }
      case "crm.click_button": {
        const actionKey = typeof params.actionKey === "string" ? params.actionKey : undefined;
        const selector = typeof params.selector === "string" ? params.selector : undefined;
        if (!actionKey && !selector) {
          return { ok: false, message: "actionKey or selector is required" };
        }
        const commandId = randomUUID();
        const result = await dispatchCrmCommand(
          {
            commandId,
            type: "desktop.crm.clickButton",
            target: {
              actionKey,
              selector,
              entityId: typeof params.entityId === "string" ? params.entityId : undefined,
            },
            payload: isRecord(params.payload) ? params.payload : undefined,
            expectAck: true,
            timeoutMs: 8000,
            createdAt: new Date().toISOString(),
          },
          this.viewManager,
        );
        return {
          ok: result.ok,
          message: result.message,
          data: result.data,
        };
      }
      case "crm.run_action": {
        const actionKey = params.actionKey as string;
        if (!actionKey) {
          return { ok: false, message: "Missing required parameter: actionKey" };
        }
        const commandId = randomUUID();
        const result = await dispatchCrmCommand(
          {
            commandId,
            type: "desktop.crm.runAction",
            target: {
              actionKey,
              entityId: typeof params.entityId === "string" ? params.entityId : undefined,
            },
            payload: isRecord(params.payload) ? params.payload : undefined,
            expectAck: true,
            timeoutMs: 12000,
            createdAt: new Date().toISOString(),
          },
          this.viewManager,
        );
        return {
          ok: result.ok,
          message: result.message,
          data: result.data,
        };
      }
      case "crm.push_json": {
        const schema = params.schema as string;
        const data = params.data;
        if (!schema || !isRecord(data)) {
          return { ok: false, message: "Missing required parameters: schema, data" };
        }
        const commandId = randomUUID();
        const result = await dispatchCrmCommand(
          {
            commandId,
            type: "desktop.crm.pushJson",
            payload: {
              handoffId:
                typeof params.handoffId === "string" ? params.handoffId : `tool_${commandId}`,
              schema,
              entityType: typeof params.entityType === "string" ? params.entityType : undefined,
              entityId: typeof params.entityId === "string" ? params.entityId : undefined,
              data,
            },
            expectAck: true,
            timeoutMs: 8000,
            createdAt: new Date().toISOString(),
          },
          this.viewManager,
        );
        return {
          ok: result.ok,
          message: result.message,
          data: result.data,
        };
      }
      case "crm.open_form_with_json": {
        const url = params.url as string;
        const actionKey = params.actionKey as string;
        const schema = params.schema as string;
        const data = params.data;
        if (!url || !actionKey || !schema || !isRecord(data)) {
          return {
            ok: false,
            message: "Missing required parameters: url, actionKey, schema, data",
          };
        }

        const handoff = createCrmHandoff({
          targetUrl: url,
          actionKey,
          schema,
          entityType: typeof params.entityType === "string" ? params.entityType : undefined,
          entityId: typeof params.entityId === "string" ? params.entityId : undefined,
          data,
          ttlMs: typeof params.ttlMs === "number" ? params.ttlMs : undefined,
        });

        markCrmHandoffStatus(handoff.handoffId, "navigating");

        const openResult = await this.controller.openExternalUrl({ url, source: "hermes" });
        if (!openResult.ok) {
          markCrmHandoffStatus(handoff.handoffId, "failed", openResult.message);
          return openResult;
        }

        return {
          ok: true,
          message: "CRM handoff created and navigation started",
          data: {
            action: "crm.handoff.created",
            handoffId: handoff.handoffId,
            targetUrl: handoff.targetUrl,
            normalizedUrl: handoff.normalizedUrl,
            expiresAt: handoff.expiresAt,
            status: "navigating",
          },
        };
      }
      default:
        return { ok: false, message: `Unknown tool: ${toolName}` };
    }
  }

  getToolSchemas() {
    return browserToolSchemas;
  }
}
