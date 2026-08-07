import type { CrmBridgeEvent, CrmBridgeEventType } from "./crm-bridge-contract";
import type {
  HostBridgeAction,
  HostBridgeSubmitEvent,
  HostDesktopCommand,
  HostPageReadyEvent,
} from "./host-bridge-contract";

const LEGACY_EVENT_TO_HOST: Record<string, HostBridgeSubmitEvent["type"] | "host.page.ready"> = {
  "crm.product.context.submit": "host.bridge.submit",
  "crm.context.submit": "host.bridge.submit",
  "crm.page.ready": "host.page.ready",
};

const LEGACY_COMMAND_ALIASES: Record<string, string> = {
  "desktop.crm.form.fill": "desktop.host.form.fill",
  "desktop.host.from.fill": "desktop.host.form.fill",
  "desktop.crm.product.fillForm": "desktop.host.form.fill",
  "desktop.crm.product.create": "desktop.host.form.fill",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function legacyActionFromEventType(type: CrmBridgeEventType): HostBridgeAction {
  if (type === "crm.product.context.submit") return "view";
  return "view";
}

export function isLegacyCrmBridgeEvent(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  return raw.source === "crm-web" && typeof raw.type === "string";
}

export function adaptLegacyCrmEventToHost(
  raw: unknown,
): HostBridgeSubmitEvent | HostPageReadyEvent | null {
  if (!isRecord(raw) || raw.source !== "crm-web") return null;

  const legacyType = raw.type as string;
  const hostType = LEGACY_EVENT_TO_HOST[legacyType];
  if (!hostType) return null;

  const requestId =
    typeof raw.requestId === "string" && raw.requestId.trim()
      ? raw.requestId
      : `legacy_${Date.now()}`;

  const sdkVersion =
    typeof raw.sdkVersion === "string" && raw.sdkVersion.trim() ? raw.sdkVersion : "legacy";

  const page = isRecord(raw.page) ? raw.page : {};
  const pageContext = {
    app: typeof page.app === "string" ? page.app : "crm-lite",
    url: typeof page.url === "string" ? page.url : "",
    title: typeof page.title === "string" ? page.title : undefined,
    entityType: typeof page.entityType === "string" ? page.entityType : undefined,
    entityId: typeof page.entityId === "string" ? page.entityId : undefined,
    entityName: typeof page.entityName === "string" ? page.entityName : undefined,
    fields: isRecord(page.fields)
      ? (page.fields as HostBridgeSubmitEvent["pageContext"]["fields"])
      : undefined,
    selectedIds: Array.isArray(page.selectedIds)
      ? page.selectedIds.filter((id): id is string => typeof id === "string")
      : undefined,
    safeText: typeof page.safeText === "string" ? page.safeText : undefined,
    data: isRecord(raw.payload) ? raw.payload : undefined,
  };

  if (hostType === "host.page.ready") {
    const trigger = isRecord(raw.trigger) ? raw.trigger : {};
    return {
      source: "host-web",
      protocolVersion: "6.0",
      sdkVersion,
      requestId,
      type: "host.page.ready",
      formType: pageContext.entityType,
      pageContext,
    };
  }

  const trigger = isRecord(raw.trigger) ? raw.trigger : {};
  const action = legacyActionFromEventType(legacyType as CrmBridgeEventType);

  return {
    source: "host-web",
    protocolVersion: "6.0",
    sdkVersion,
    requestId,
    type: "host.bridge.submit",
    formType:
      pageContext.entityType === "product" || legacyType === "crm.product.context.submit"
        ? "product"
        : "unknown",
    action,
    trigger: {
      type: "user-click",
      elementId: typeof trigger.elementId === "string" ? trigger.elementId : undefined,
      label: typeof trigger.label === "string" ? trigger.label : undefined,
      timestamp:
        typeof trigger.timestamp === "string" && trigger.timestamp.trim()
          ? trigger.timestamp
          : new Date().toISOString(),
    },
    pageContext,
  };
}

export function normalizeHostDesktopCommandType(type: string): string {
  return LEGACY_COMMAND_ALIASES[type] ?? type;
}

export function adaptLegacyCommandToHost(commandInput: unknown): HostDesktopCommand | null {
  if (!isRecord(commandInput)) return null;
  if (typeof commandInput.type !== "string") return null;

  const normalizedType = normalizeHostDesktopCommandType(commandInput.type);

  if (
    normalizedType === "desktop.host.form.fill" &&
    (commandInput.type === "desktop.crm.product.fillForm" ||
      commandInput.type === "desktop.crm.product.create")
  ) {
    const payload = isRecord(commandInput.payload) ? commandInput.payload : {};
    const product = isRecord(payload.product) ? payload.product : payload;
    return {
      commandId:
        typeof commandInput.commandId === "string"
          ? commandInput.commandId
          : `cmd_${Date.now()}`,
      type: "desktop.host.form.fill",
      formType: "product",
      action: commandInput.type === "desktop.crm.product.create" ? "create" : "edit",
      payload: {
        fields: product as Record<string, unknown>,
        subTables: isRecord(payload.subTables)
          ? (payload.subTables as Record<string, Array<Record<string, unknown>>>)
          : undefined,
      },
      createdAt:
        typeof commandInput.createdAt === "string"
          ? commandInput.createdAt
          : new Date().toISOString(),
      expectAck: commandInput.expectAck !== false,
      timeoutMs: typeof commandInput.timeoutMs === "number" ? commandInput.timeoutMs : 8000,
    };
  }

  return {
    commandId:
      typeof commandInput.commandId === "string" ? commandInput.commandId : `cmd_${Date.now()}`,
    type: normalizedType,
    target: isRecord(commandInput.target)
      ? (commandInput.target as HostDesktopCommand["target"])
      : undefined,
    payload: isRecord(commandInput.payload) ? commandInput.payload : undefined,
    createdAt:
      typeof commandInput.createdAt === "string"
        ? commandInput.createdAt
        : new Date().toISOString(),
    expectAck: typeof commandInput.expectAck === "boolean" ? commandInput.expectAck : undefined,
    timeoutMs: typeof commandInput.timeoutMs === "number" ? commandInput.timeoutMs : undefined,
  };
}

export function hostEventToCrmBridgeEvent(event: HostBridgeSubmitEvent): CrmBridgeEvent {
  return {
    source: "crm-web",
    sdkVersion: event.sdkVersion,
    requestId: event.requestId,
    type: "crm.product.context.submit",
    trigger: event.trigger,
    page: {
      app: event.pageContext.app === "crm-lite" ? "crm-lite" : "crm",
      entityType: event.pageContext.entityType as CrmBridgeEvent["page"]["entityType"],
      entityId: event.pageContext.entityId,
      entityName: event.pageContext.entityName,
      url: event.pageContext.url,
      title: event.pageContext.title,
      selectedIds: event.pageContext.selectedIds,
      fields: event.pageContext.fields,
      safeText: event.pageContext.safeText,
    },
    payload: event.pageContext.data,
  };
}
