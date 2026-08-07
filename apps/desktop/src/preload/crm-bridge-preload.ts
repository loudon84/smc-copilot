import { contextBridge, ipcRenderer } from "electron";
import { CrmBridgeEvents } from "../shared/crm-bridge/crm-bridge-contract";
import { HostBridgeEvents } from "../shared/crm-bridge/host-bridge-contract";
import type {
  HostBridgePageContext,
  HostBridgeResult,
} from "../shared/crm-bridge/host-bridge-contract";

console.info("[HOST-BRIDGE-PRELOAD] script evaluating");

const SDK_SOURCE = "copilot-host-jssdk";
const LEGACY_SDK_SOURCE = "copilot-crm-jssdk";
const DESKTOP_SOURCE = "copilot-desktop";
const HOST_SUBMIT_CHANNEL = "host.bridge.submit";
const HOST_READY_CHANNEL = "host.page.ready";
const HOST_COMMAND_CHANNEL = "host.desktop.command";
const HOST_COMMAND_RESULT_CHANNEL = "host.desktop.command.result";
const LEGACY_EVENT_CHANNEL = "crm.desktop.bridge";
const LEGACY_COMMAND_CHANNEL = "crm.desktop.command";
const LEGACY_COMMAND_RESULT_CHANNEL = "crm.desktop.command.result";
const LEGACY_READY_CHANNEL = "crm.desktop.ready";
const READY_CHANNEL = "host.desktop.ready";
const BRIDGE_VERSION = "6.0.0";
const PROTOCOL_VERSION = "6.0";
const USER_GESTURE_WINDOW_MS = 3000;

let lastTrustedClickAt = 0;

function markTrustedGesture(event: Event): void {
  if (event.isTrusted) {
    lastTrustedClickAt = Date.now();
  }
}

for (const gestureEvent of ["pointerdown", "mousedown", "click"] as const) {
  window.addEventListener(gestureEvent, markTrustedGesture, true);
}

function hasRecentTrustedGesture(): boolean {
  return Date.now() - lastTrustedClickAt <= USER_GESTURE_WINDOW_MS;
}

function assertTrustedGesture(): void {
  if (!hasRecentTrustedGesture()) {
    throw new Error("USER_GESTURE_REQUIRED");
  }
}

/** postMessage / emit 路径：本 frame 手势，或事件内 user-click 时间戳（iframe 场景） */
function hasValidUserClickTrigger(event: unknown): boolean {
  const trigger = (event as { trigger?: { type?: string; timestamp?: string } })?.trigger;
  if (trigger?.type !== "user-click" || !trigger.timestamp) return false;
  const ts = Date.parse(trigger.timestamp);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts <= USER_GESTURE_WINDOW_MS;
}

function assertEmitAllowed(event: unknown): void {
  if (hasRecentTrustedGesture() || hasValidUserClickTrigger(event)) return;
  throw new Error("USER_GESTURE_REQUIRED");
}

function buildLocation() {
  return {
    href: window.location.href,
    origin: window.location.origin,
    title: document.title,
  };
}

async function invokeEmit(event: unknown): Promise<HostBridgeResult> {
  return ipcRenderer.invoke("host-bridge:emit", {
    event,
    location: buildLocation(),
    receivedAt: new Date().toISOString(),
  });
}

async function invokePageReady(event: unknown): Promise<HostBridgeResult> {
  return ipcRenderer.invoke("host-bridge:page-ready", {
    event,
    location: buildLocation(),
    receivedAt: new Date().toISOString(),
  });
}

async function emit(event: unknown): Promise<HostBridgeResult> {
  try {
    assertEmitAllowed(event);
    return await invokeEmit(event);
  } catch (error) {
    return {
      ok: false,
      requestId:
        typeof (event as { requestId?: string })?.requestId === "string"
          ? (event as { requestId: string }).requestId
          : "",
      message: error instanceof Error ? error.message : String(error),
      errorCode: "USER_GESTURE_REQUIRED",
    };
  }
}

async function emitReady(event: unknown): Promise<HostBridgeResult> {
  try {
    return await invokePageReady(event);
  } catch (error) {
    return {
      ok: false,
      requestId:
        typeof (event as { requestId?: string })?.requestId === "string"
          ? (event as { requestId: string }).requestId
          : "",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function submit(input: {
  formType: string;
  action: "create" | "edit" | "view" | "analytic";
  callbackUrl?: string;
  skillName?: string;
  pageContext: HostBridgePageContext;
  trigger?: { elementId?: string; label?: string };
}): Promise<HostBridgeResult> {
  const event = {
    source: "host-web",
    protocolVersion: PROTOCOL_VERSION,
    sdkVersion: BRIDGE_VERSION,
    requestId: `host_${Date.now()}`,
    type: "host.bridge.submit",
    formType: input.formType,
    action: input.action,
    callbackUrl: input.callbackUrl,
    skillName: input.skillName,
    trigger: {
      type: "user-click",
      elementId: input.trigger?.elementId,
      label: input.trigger?.label,
      timestamp: new Date().toISOString(),
    },
    pageContext: input.pageContext,
  };
  try {
    // submit() 由页面 click 处理器调用；iframe 内点击无法被 top frame preload 监听到
    return await invokeEmit(event);
  } catch (error) {
    return {
      ok: false,
      requestId: event.requestId,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function ready(input?: {
  formType?: string;
  action?: string;
  pageContext?: Partial<HostBridgePageContext>;
}): Promise<HostBridgeResult> {
  const event = {
    source: "host-web",
    protocolVersion: PROTOCOL_VERSION,
    sdkVersion: BRIDGE_VERSION,
    requestId: `host_ready_${Date.now()}`,
    type: "host.page.ready",
    formType: input?.formType,
    action: input?.action,
    pageContext: {
      app: input?.pageContext?.app ?? "host",
      url: input?.pageContext?.url ?? window.location.href,
      title: input?.pageContext?.title ?? document.title,
      entityType: input?.pageContext?.entityType,
      entityId: input?.pageContext?.entityId,
      entityName: input?.pageContext?.entityName,
    },
  };
  return emitReady(event);
}

function submitProductContext(
  product: Record<string, unknown>,
  options?: { triggerElementId?: string; triggerLabel?: string },
): Promise<HostBridgeResult> {
  return submit({
    formType: "product",
    action: "view",
    pageContext: {
      app: "crm-lite",
      url: window.location.href,
      title: document.title,
      entityType: "product",
      entityId: typeof product.id === "string" ? product.id : undefined,
      entityName: typeof product.productName === "string" ? product.productName : undefined,
      data: { product },
    },
    trigger: {
      elementId: options?.triggerElementId,
      label: options?.triggerLabel,
    },
  });
}

const hostBridgeApi = {
  version: BRIDGE_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  isAvailable: () => true,
  submit,
  ready,
  emit,
  emitReady,
};

contextBridge.exposeInMainWorld("CopilotHostBridge", hostBridgeApi);

contextBridge.exposeInMainWorld("CopilotHostBridgeSDK", {
  ...hostBridgeApi,
  onCommand: (handler: (command: unknown) => Promise<unknown> | unknown) => {
    const listener = async (messageEvent: MessageEvent) => {
      if (messageEvent.origin !== window.location.origin) return;
      const data = messageEvent.data as {
        source?: string;
        channel?: string;
        command?: unknown;
      } | null;
      if (!data || data.source !== DESKTOP_SOURCE) return;
      if (
        data.channel !== HOST_COMMAND_CHANNEL &&
        data.channel !== LEGACY_COMMAND_CHANNEL
      ) {
        return;
      }
      if (!data.command) return;
      try {
        const result = await handler(data.command);
        if (
          result &&
          typeof result === "object" &&
          "commandId" in (result as object)
        ) {
          const ack = result as Record<string, unknown>;
          void ipcRenderer.invoke("host-bridge:command-result", ack);
        }
      } catch (error) {
        console.warn("[HOST-BRIDGE-PRELOAD] onCommand handler error:", error);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  },
  ack: (
    commandId: string,
    result: {
      ok: boolean;
      type: string;
      action?: string;
      message?: string;
      data?: Record<string, unknown>;
      errorCode?: string;
    },
  ) => {
    const now = new Date().toISOString();
    void ipcRenderer.invoke("host-bridge:command-result", {
      commandId,
      ...result,
      receivedAt: now,
      completedAt: now,
    });
  },
});

const legacyAdapter = {
  version: BRIDGE_VERSION,
  isAvailable: () => true,
  emit,
  emitReady,
};

contextBridge.exposeInMainWorld("CopilotDesktopCRM", legacyAdapter);
contextBridge.exposeInMainWorld("CopilotCrmBridge", legacyAdapter);

contextBridge.exposeInMainWorld("CopilotCrmDesktopSDK", {
  version: BRIDGE_VERSION,
  isAvailable: () => true,
  submitProductContext,
  submit,
  ready,
});

window.addEventListener("message", (messageEvent) => {
  if (messageEvent.origin !== window.location.origin) return;

  const data = messageEvent.data as {
    source?: string;
    channel?: string;
    event?: unknown;
    result?: unknown;
  } | null;

  if (!data) return;

  const isHostSdk = data.source === SDK_SOURCE;
  const isLegacySdk = data.source === LEGACY_SDK_SOURCE;
  if (!isHostSdk && !isLegacySdk) return;

  if (
    (data.channel === HOST_SUBMIT_CHANNEL || data.channel === LEGACY_EVENT_CHANNEL) &&
    data.event
  ) {
    void emit(data.event);
    return;
  }

  if (
    (data.channel === HOST_READY_CHANNEL ||
      data.channel === LEGACY_READY_CHANNEL ||
      data.channel === "crm.desktop.ready") &&
    data.event
  ) {
    void emitReady(data.event);
    return;
  }

  if (
    (data.channel === HOST_COMMAND_RESULT_CHANNEL ||
      data.channel === LEGACY_COMMAND_RESULT_CHANNEL) &&
    data.result
  ) {
    void ipcRenderer.invoke("host-bridge:command-result", data.result);
  }
});

function commandRequiresAck(command: unknown): boolean {
  if (!command || typeof command !== "object") return false;
  const typed = command as { expectAck?: boolean; replyRequired?: boolean; type?: string };
  if (typed.expectAck === true || typed.replyRequired === true) return true;
  if (typed.expectAck === false) return false;
  return (
    typed.type === "desktop.host.form.fill" ||
    typed.type === "desktop.host.form.patch" ||
    typed.type === "desktop.host.clickButton" ||
    typed.type === "desktop.crm.form.fill" ||
    typed.type === "desktop.crm.product.fillForm"
  );
}

function forwardCommandToPage(command: unknown, channel: string): void {
  window.postMessage(
    {
      source: DESKTOP_SOURCE,
      channel,
      protocolVersion: PROTOCOL_VERSION,
      command,
      replyRequired: commandRequiresAck(command),
    },
    window.location.origin,
  );
}

ipcRenderer.on(HostBridgeEvents.COMMAND, (_event, command) => {
  forwardCommandToPage(command, HOST_COMMAND_CHANNEL);
  forwardCommandToPage(command, LEGACY_COMMAND_CHANNEL);
});

ipcRenderer.on(CrmBridgeEvents.COMMAND, (_event, command) => {
  forwardCommandToPage(command, HOST_COMMAND_CHANNEL);
  forwardCommandToPage(command, LEGACY_COMMAND_CHANNEL);
});

window.postMessage(
  {
    source: DESKTOP_SOURCE,
    channel: READY_CHANNEL,
    version: BRIDGE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
  },
  window.location.origin,
);
