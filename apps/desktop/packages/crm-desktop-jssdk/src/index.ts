import type {
  CrmDesktopCommand,
  CrmDesktopEmitOptions,
  CrmDesktopEventType,
  CrmDesktopPageContext,
} from "./types";

declare global {
  interface Window {
    CopilotDesktopCRM?: {
      emit: (event: unknown) => Promise<{ ok: boolean; message?: string }>;
      isAvailable?: () => boolean;
      version?: string;
    };
    CopilotCrmDesktopSDK?: typeof CopilotCrmDesktopSDK;
  }
}

const SDK_VERSION = "0.1.0";
const MESSAGE_CHANNEL = "crm.desktop.bridge";
const COMMAND_CHANNEL = "crm.desktop.command";

function createRequestId(): string {
  return `crm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizePageContext(input: CrmDesktopPageContext): CrmDesktopPageContext {
  return {
    ...input,
    app: "crm",
    url: input.url ?? window.location.href,
    title: input.title ?? document.title,
  };
}

async function emit(
  type: CrmDesktopEventType,
  page: CrmDesktopPageContext,
  payload?: Record<string, unknown>,
  options?: CrmDesktopEmitOptions,
): Promise<{ ok: boolean; message?: string }> {
  const event = {
    source: "crm-web",
    sdkVersion: SDK_VERSION,
    requestId: options?.requestId ?? createRequestId(),
    type,
    trigger: {
      type: "user-click",
      elementId: options?.triggerElementId,
      label: options?.triggerLabel,
      timestamp: new Date().toISOString(),
    },
    page: normalizePageContext(page),
    payload,
  };

  if (window.CopilotDesktopCRM?.emit) {
    return await window.CopilotDesktopCRM.emit(event);
  }

  window.postMessage(
    {
      source: "copilot-crm-jssdk",
      channel: MESSAGE_CHANNEL,
      version: SDK_VERSION,
      event,
    },
    window.location.origin,
  );

  return {
    ok: false,
    message: "Desktop bridge is not available in this browser context",
  };
}

function submitPageContext(
  page: CrmDesktopPageContext,
  payload?: Record<string, unknown>,
  options?: CrmDesktopEmitOptions,
): Promise<{ ok: boolean; message?: string }> {
  return emit("crm.context.submit", page, payload, options);
}

function onCommand(handler: (command: CrmDesktopCommand) => void): () => void {
  const listener = (event: MessageEvent): void => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as {
      source?: string;
      channel?: string;
      command?: unknown;
    } | null;
    if (!data || data.source !== "copilot-desktop") return;
    if (data.channel !== COMMAND_CHANNEL) return;
    if (!data.command) return;
    handler(data.command as CrmDesktopCommand);
  };

  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

function isDesktopAvailable(): boolean {
  return Boolean(window.CopilotDesktopCRM?.emit);
}

export const CopilotCrmDesktopSDK = {
  version: SDK_VERSION,
  emit,
  submitPageContext,
  onCommand,
  isDesktopAvailable,
};

window.CopilotCrmDesktopSDK = CopilotCrmDesktopSDK;

