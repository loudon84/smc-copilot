import { randomUUID } from "crypto";
import { ipcMain, type BrowserWindow } from "electron";
import type { WebOperatorTab } from "../../shared/crm-bridge/host-bridge-contract";
import { HostBridgeEvents } from "../../shared/crm-bridge/host-bridge-contract";
import { WEB_OPERATOR_PARTITION } from "../../shared/shell/browser-partitions";
import { isHostCallbackUrlAllowed } from "../crm-bridge/host-bridge-config";
import {
  attachCrmLitePageInjector,
  injectCrmLiteJssdkIfNeeded,
} from "../crm-bridge/crm-lite-page-injector";
import type { ShellViewManager } from "../shell/views/shell-view-manager";
import { WEB_OPERATOR_LAYER_ID } from "./shell-browser-view-adapter";

const DEFAULT_LAYER_ID = WEB_OPERATOR_LAYER_ID;

export function webOperatorTabLayerId(tabId: string): string {
  return tabId === "default" ? DEFAULT_LAYER_ID : `web-operator-tab-${tabId}`;
}

let shellViewManager: ShellViewManager | null = null;
let mainWindowGetter: (() => BrowserWindow | null) | null = null;

const tabs = new Map<string, WebOperatorTab>();
let activeTabId: string = "default";

function emitTabsChanged(): void {
  const win = mainWindowGetter?.();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(HostBridgeEvents.TABS_CHANGED, {
    tabs: listWebOperatorTabs(),
    activeTabId,
  });
}

export function initWebOperatorTabManager(
  manager: ShellViewManager,
  getMainWindow: () => BrowserWindow | null,
): void {
  shellViewManager = manager;
  mainWindowGetter = getMainWindow;

  if (!tabs.has("default")) {
    const now = new Date().toISOString();
    tabs.set("default", {
      tabId: "default",
      title: "Web Operator",
      url: "",
      status: "ready",
      kind: "normal",
      createdAt: now,
      updatedAt: now,
    });
  }
}

export function listWebOperatorTabs(): WebOperatorTab[] {
  return Array.from(tabs.values()).sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

export function getActiveWebOperatorTab(): WebOperatorTab | null {
  return tabs.get(activeTabId) ?? null;
}

export function getActiveWebOperatorTabId(): string {
  return activeTabId;
}

export function getActiveWebOperatorLayerId(): string {
  return webOperatorTabLayerId(activeTabId);
}

export function findWebOperatorTabByWebContentsId(
  webContentsId: number,
): WebOperatorTab | null {
  for (const tab of tabs.values()) {
    if (tab.webContentsId === webContentsId) {
      return tab;
    }
    const layerId = webOperatorTabLayerId(tab.tabId);
    const wc = getWebContentsForTabLayer(layerId);
    if (wc?.id === webContentsId) {
      tab.webContentsId = wc.id;
      return tab;
    }
  }
  return null;
}

export function getWebContentsForTabLayer(layerId: string): Electron.WebContents | null {
  const wc = shellViewManager?.getView(layerId)?.getWebContents() ?? null;
  return wc && !wc.isDestroyed() ? wc : null;
}

export function getWebOperatorTabWebContentsId(
  tabIdOrAny: string | null,
): number | number[] | null {
  if (tabIdOrAny === "any") {
    const ids: number[] = [];
    for (const tab of tabs.values()) {
      const layerId = webOperatorTabLayerId(tab.tabId);
      const wc = getWebContentsForTabLayer(layerId);
      if (wc) ids.push(wc.id);
    }
    return ids;
  }

  const tabId = tabIdOrAny ?? activeTabId;
  const layerId = webOperatorTabLayerId(tabId);
  const wc = getWebContentsForTabLayer(layerId);
  return wc ? wc.id : null;
}

function deriveTabTitle(input: {
  title?: string;
  url: string;
  kind?: WebOperatorTab["kind"];
  hostBridge?: WebOperatorTab["hostBridge"];
}): string {
  if (input.title?.trim()) return input.title.trim();
  if (input.kind === "host-callback" && input.hostBridge?.formType && input.hostBridge.action) {
    return `${input.hostBridge.formType}:${input.hostBridge.action}`;
  }
  try {
    const parsed = new URL(input.url);
    const path = parsed.pathname.split("/").filter(Boolean).pop();
    return path ?? parsed.hostname ?? "Tab";
  } catch {
    return "Tab";
  }
}

export async function createWebOperatorTab(input: {
  url: string;
  title?: string;
  kind?: WebOperatorTab["kind"];
  hostBridge?: WebOperatorTab["hostBridge"];
  activate?: boolean;
}): Promise<WebOperatorTab> {
  if (!shellViewManager) {
    throw new Error("WebOperator tab manager not initialized");
  }

  const trimmedUrl = input.url.trim();
  if (!trimmedUrl) {
    throw new Error("web-operator-tabs:create requires a non-empty url");
  }
  try {
    // Ensure we only load absolute URLs (Electron will throw ERR_INVALID_URL otherwise).
    // eslint-disable-next-line no-new
    new URL(trimmedUrl);
  } catch {
    throw new Error(`web-operator-tabs:create invalid url: ${trimmedUrl}`);
  }

  const tabId = randomUUID();
  const layerId = webOperatorTabLayerId(tabId);
  const now = new Date().toISOString();

  const tab: WebOperatorTab = {
    tabId,
    title: deriveTabTitle(input),
    url: trimmedUrl,
    status: "loading",
    kind: input.kind ?? "normal",
    hostBridge: input.hostBridge,
    createdAt: now,
    updatedAt: now,
  };

  tabs.set(tabId, tab);

  await shellViewManager.createView(layerId, "web-operator", trimmedUrl, {
    layer: "content",
    partition: WEB_OPERATOR_PARTITION,
    contextIsolation: true,
    nodeIntegration: false,
  });

  const wc = getWebContentsForTabLayer(layerId);
  if (wc) {
    tab.webContentsId = wc.id;
    attachCrmLitePageInjector(wc);
    wc.on("did-finish-load", () => {
      void injectCrmLiteJssdkIfNeeded(wc).then(async () => {
        const { tryDeliverHostHandoffAfterPageLoad } = await import(
          "../crm-bridge/host-handoff-orchestrator"
        );
        await tryDeliverHostHandoffAfterPageLoad(wc);
      });
    });
    wc.once("did-finish-load", () => {
      const existing = tabs.get(tabId);
      if (!existing) return;
      existing.status = "ready";
      existing.updatedAt = new Date().toISOString();
      emitTabsChanged();
    });
    wc.once("did-fail-load", () => {
      const existing = tabs.get(tabId);
      if (!existing) return;
      existing.status = "failed";
      existing.updatedAt = new Date().toISOString();
      emitTabsChanged();
    });
  }

  if (input.activate !== false) {
    await activateWebOperatorTab(tabId);
  }

  emitTabsChanged();
  return tab;
}

export async function activateWebOperatorTab(tabId: string): Promise<WebOperatorTab | null> {
  const tab = tabs.get(tabId);
  if (!tab || !shellViewManager) return null;

  for (const other of tabs.keys()) {
    if (other === tabId) continue;
    shellViewManager.deactivateView(webOperatorTabLayerId(other));
  }

  activeTabId = tabId;
  tab.updatedAt = new Date().toISOString();
  emitTabsChanged();
  return tab;
}

export async function closeWebOperatorTab(tabId: string): Promise<boolean> {
  if (tabId === "default") return false;

  const tab = tabs.get(tabId);
  if (!tab || !shellViewManager) return false;

  const layerId = webOperatorTabLayerId(tabId);
  shellViewManager.destroyView(layerId);
  tabs.delete(tabId);

  if (activeTabId === tabId) {
    activeTabId = "default";
  }

  emitTabsChanged();
  return true;
}

export async function openHostCallbackTab(input: {
  requestId: string;
  formType: string;
  action: "create" | "edit";
  callbackUrl: string;
  handoffId: string;
}): Promise<WebOperatorTab> {
  if (!isHostCallbackUrlAllowed(input.callbackUrl)) {
    throw new Error("CALLBACK_URL_NOT_ALLOWED");
  }

  const existing = listWebOperatorTabs().find(
    (tab) =>
      tab.kind === "host-callback" &&
      tab.hostBridge?.requestId === input.requestId &&
      tab.url === input.callbackUrl,
  );

  if (existing) {
    await activateWebOperatorTab(existing.tabId);
    return existing;
  }

  return createWebOperatorTab({
    url: input.callbackUrl,
    kind: "host-callback",
    hostBridge: {
      requestId: input.requestId,
      formType: input.formType,
      action: input.action,
      callbackUrl: input.callbackUrl,
      handoffId: input.handoffId,
    },
    activate: true,
  });
}

let tabsIpcRegistered = false;

export function registerWebOperatorTabsIpc(): void {
  if (tabsIpcRegistered) return;

  ipcMain.handle("web-operator-tabs:list", () => listWebOperatorTabs());

  ipcMain.handle("web-operator-tabs:get-active", () => ({
    tab: getActiveWebOperatorTab(),
    activeTabId,
    layerId: getActiveWebOperatorLayerId(),
  }));

  ipcMain.handle("web-operator-tabs:create", async (_event, input: {
    url: string;
    title?: string;
    kind?: WebOperatorTab["kind"];
    hostBridge?: WebOperatorTab["hostBridge"];
    activate?: boolean;
  }) => {
    return createWebOperatorTab({
      url: input.url,
      title: input.title,
      kind: input.kind ?? "normal",
      hostBridge: input.hostBridge,
      activate: input.activate,
    });
  });

  ipcMain.handle("web-operator-tabs:activate", async (_event, tabId: string) => {
    return activateWebOperatorTab(tabId);
  });

  ipcMain.handle("web-operator-tabs:close", async (_event, tabId: string) => {
    return closeWebOperatorTab(tabId);
  });

  ipcMain.handle("web-operator-tabs:open-callback", async (_event, input) => {
    return openHostCallbackTab(input);
  });

  tabsIpcRegistered = true;
}

export function unregisterWebOperatorTabsIpc(): void {
  if (!tabsIpcRegistered) return;
  const channels = [
    "web-operator-tabs:list",
    "web-operator-tabs:get-active",
    "web-operator-tabs:create",
    "web-operator-tabs:activate",
    "web-operator-tabs:close",
    "web-operator-tabs:open-callback",
  ];
  for (const ch of channels) {
    ipcMain.removeHandler(ch);
  }
  tabsIpcRegistered = false;
}
