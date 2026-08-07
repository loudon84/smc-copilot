import { ipcMain } from "electron";
import type {
  BrowserOpenRequest,
  BrowserClickRequest,
  BrowserTypeRequest,
  BrowserExtractTableRequest,
  BrowserViewBounds,
  BrowserActionResult,
  BrowserOpenResult,
  BrowserStateResult,
  BrowserScreenshotResult,
  BrowserAuditRecord,
} from "../../shared/browser/browser-contract";
import type {
  BrowserRuntimeState,
  BrowserStructuredActionResult,
  BrowserTypeOptions,
  BrowserScrollOptions,
  BrowserScreenshotOptions,
  BrowserStructuredScreenshotResult,
  BrowserActionLogEntry,
} from "../../shared/browser/browser-action-contract";
import type {
  BrowserSnapshotOptions,
  BrowserPageSnapshot,
  BrowserElementTarget,
} from "../../shared/browser/browser-snapshot-contract";
import type { BrowserFrameSnapshot } from "../../shared/browser/browser-frame-contract";
import type {
  BrowserFrameHtmlRequest,
  BrowserFrameHtmlResult,
} from "../../shared/browser/browser-frame-contract";
import type { BrowserElementSnapshot } from "../../shared/browser/browser-snapshot-contract";
import { BrowserController } from "./browser-controller";
import type { BrowserViewPort } from "./browser-viewport";

export class BrowserIPC {
  private controller: BrowserController;
  private viewManager: BrowserViewPort;
  private registered: boolean = false;

  constructor(controller: BrowserController, viewManager: BrowserViewPort) {
    this.controller = controller;
    this.viewManager = viewManager;
  }

  register(): void {
    if (this.registered) return;

    ipcMain.handle("browser.open", async (_event, request: BrowserOpenRequest): Promise<BrowserOpenResult> => {
      try {
        return await this.controller.openExternalUrl(request);
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    });

    ipcMain.handle("browser.back", async (_event, source: "user" | "hermes" | "system" = "user"): Promise<BrowserActionResult> => {
      try {
        return await this.controller.goBack(source);
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    });

    ipcMain.handle("browser.forward", async (_event, source: "user" | "hermes" | "system" = "user"): Promise<BrowserActionResult> => {
      try {
        return await this.controller.goForward(source);
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    });

    ipcMain.handle("browser.reload", async (_event, source: "user" | "hermes" | "system" = "user"): Promise<BrowserActionResult> => {
      try {
        return await this.controller.reload(source);
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    });

    ipcMain.handle("browser.get_state", async (_event, source: "user" | "hermes" | "system" = "user"): Promise<BrowserStateResult> => {
      try {
        return await this.controller.getPageState(source);
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    });

    ipcMain.handle("browser.screenshot", async (_event, source: "user" | "hermes" | "system" = "user"): Promise<BrowserScreenshotResult> => {
      try {
        return await this.controller.captureScreenshot(source);
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    });

    ipcMain.handle("browser.click", async (_event, request: BrowserClickRequest): Promise<BrowserActionResult> => {
      try {
        return await this.controller.clickSelector(request);
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    });

    ipcMain.handle("browser.type", async (_event, request: BrowserTypeRequest): Promise<BrowserActionResult> => {
      try {
        return await this.controller.typeIntoSelector(request);
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    });

    ipcMain.handle("browser.extract_table", async (_event, request: BrowserExtractTableRequest): Promise<BrowserActionResult> => {
      try {
        return await this.controller.extractTable(request);
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    });

    ipcMain.handle("browser.get_audit_log", async (_event, limit?: number): Promise<BrowserAuditRecord[]> => {
      try {
        return this.controller.getAuditLog(limit);
      } catch {
        return [];
      }
    });

    ipcMain.handle("browser.confirm_action", async (_event, pendingActionId: string): Promise<BrowserActionResult> => {
      try {
        return await this.controller.confirmAction(pendingActionId);
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    });

    ipcMain.handle("browser.reject_action", async (_event, pendingActionId: string): Promise<BrowserActionResult> => {
      try {
        return await this.controller.rejectAction(pendingActionId);
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    });

    ipcMain.handle("browser.update_bounds", async (_event, bounds: BrowserViewBounds): Promise<void> => {
      this.viewManager.updateBounds(bounds);
    });

    // v5.7 colon-style channels
    ipcMain.handle("browser:get-state", async (): Promise<BrowserRuntimeState> => {
      return this.controller.getRuntimeState();
    });

    ipcMain.handle("browser:list-frames", async (): Promise<BrowserFrameSnapshot[]> => {
      return this.controller.listFrames();
    });

    ipcMain.handle(
      "browser:snapshot",
      async (_event, options?: BrowserSnapshotOptions): Promise<BrowserPageSnapshot> => {
        return this.controller.capturePageSnapshot(options);
      },
    );

    ipcMain.handle(
      "browser:find-element",
      async (_event, target: BrowserElementTarget): Promise<BrowserElementSnapshot | null> => {
        return this.controller.findElement(target);
      },
    );

    ipcMain.handle(
      "browser:click-element",
      async (_event, target: BrowserElementTarget): Promise<BrowserStructuredActionResult> => {
        return this.controller.clickElement(target);
      },
    );

    ipcMain.handle(
      "browser:type-element",
      async (
        _event,
        payload: { target: BrowserElementTarget; text: string; options?: BrowserTypeOptions },
      ): Promise<BrowserStructuredActionResult> => {
        return this.controller.typeElement(payload.target, payload.text, payload.options);
      },
    );

    ipcMain.handle(
      "browser:select-option",
      async (
        _event,
        payload: { target: BrowserElementTarget; value: string },
      ): Promise<BrowserStructuredActionResult> => {
        return this.controller.selectOption(payload.target, payload.value);
      },
    );

    ipcMain.handle(
      "browser:scroll",
      async (_event, options: BrowserScrollOptions): Promise<BrowserStructuredActionResult> => {
        return this.controller.scrollPage(options);
      },
    );

    ipcMain.handle(
      "browser:screenshot-v2",
      async (
        _event,
        options?: BrowserScreenshotOptions,
      ): Promise<BrowserStructuredScreenshotResult | null> => {
        return this.controller.captureStructuredScreenshot(options);
      },
    );

    ipcMain.handle(
      "browser:get-frame-html",
      async (_event, target: BrowserFrameHtmlRequest): Promise<BrowserFrameHtmlResult> => {
        return this.controller.getFrameHtml(target);
      },
    );

    ipcMain.handle(
      "browser:action-logs",
      async (_event, limit?: number): Promise<BrowserActionLogEntry[]> => {
        return this.controller.getActionLogs(limit);
      },
    );

    ipcMain.handle("browser:clear-action-logs", async (): Promise<{ ok: boolean }> => {
      return this.controller.clearActionLogs();
    });

    this.registered = true;
  }

  unregister(): void {
    if (!this.registered) return;
    const channels = [
      "browser.open", "browser.back", "browser.forward", "browser.reload",
      "browser.get_state", "browser.screenshot", "browser.click", "browser.type",
      "browser.extract_table", "browser.get_audit_log",
      "browser.confirm_action", "browser.reject_action", "browser.update_bounds",
      "browser:get-state", "browser:list-frames", "browser:snapshot",
      "browser:find-element", "browser:click-element", "browser:type-element",
      "browser:select-option", "browser:scroll", "browser:screenshot-v2",
      "browser:get-frame-html",
      "browser:action-logs", "browser:clear-action-logs",
    ];
    for (const ch of channels) {
      ipcMain.removeHandler(ch);
    }
    this.registered = false;
  }
}
