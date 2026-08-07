import type {
  HostBridgeAction,
  HostBridgeEventType,
  HostBridgeSubmitEvent,
  HostPageReadyEvent,
} from "./host-bridge-contract";
import { ALLOWED_HOST_BRIDGE_EVENT_TYPES } from "./host-bridge-contract";

const ALLOWED_EVENT_TYPES = new Set<HostBridgeEventType>(ALLOWED_HOST_BRIDGE_EVENT_TYPES);

const ALLOWED_ACTIONS = new Set<HostBridgeAction>(["create", "edit", "view", "analytic"]);

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "password",
  "token",
  "cookie",
  "authorization",
  "apiKey",
  "api_key",
  "secret",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasForbiddenSecrets(value: unknown, depth = 0): boolean {
  if (depth > 6) return false;
  if (!isRecord(value)) return false;

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key.toLowerCase())) {
      return true;
    }
    if (hasForbiddenSecrets(child, depth + 1)) {
      return true;
    }
  }
  return false;
}

export interface HostBridgeSchemaValidation {
  ok: boolean;
  event?: HostBridgeSubmitEvent | HostPageReadyEvent;
  message?: string;
}

function parsePageContext(raw: unknown): HostBridgeSubmitEvent["pageContext"] | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.app !== "string" || !raw.app.trim()) return null;
  if (typeof raw.url !== "string" || !raw.url.trim()) return null;

  return {
    app: raw.app,
    url: raw.url,
    title: typeof raw.title === "string" ? raw.title : undefined,
    entityType: typeof raw.entityType === "string" ? raw.entityType : undefined,
    entityId: typeof raw.entityId === "string" ? raw.entityId : undefined,
    entityName: typeof raw.entityName === "string" ? raw.entityName : undefined,
    fields: isRecord(raw.fields)
      ? (raw.fields as HostBridgeSubmitEvent["pageContext"]["fields"])
      : undefined,
    selectedIds: Array.isArray(raw.selectedIds)
      ? raw.selectedIds.filter((id): id is string => typeof id === "string")
      : undefined,
    safeText: typeof raw.safeText === "string" ? raw.safeText : undefined,
    data: isRecord(raw.data) ? raw.data : undefined,
  };
}

function parseTrigger(raw: unknown, required: boolean): HostBridgeSubmitEvent["trigger"] | null {
  if (!isRecord(raw)) {
    if (!required) {
      return { type: "user-click", timestamp: new Date().toISOString() };
    }
    return null;
  }
  if (raw.type !== "user-click") return null;
  if (typeof raw.timestamp !== "string" || !raw.timestamp.trim()) return null;
  return {
    type: "user-click",
    elementId: typeof raw.elementId === "string" ? raw.elementId : undefined,
    label: typeof raw.label === "string" ? raw.label : undefined,
    timestamp: raw.timestamp,
  };
}

export function validateHostBridgeEventSchema(
  raw: unknown,
  options?: {
    allowedFormTypes?: string[];
    allowedActions?: string[];
  },
): HostBridgeSchemaValidation {
  if (!isRecord(raw)) {
    return { ok: false, message: "Event must be an object" };
  }

  if (raw.source !== "host-web") {
    return { ok: false, message: "Invalid event source" };
  }

  if (raw.protocolVersion !== "6.0") {
    return { ok: false, message: "protocolVersion must be 6.0" };
  }

  if (typeof raw.sdkVersion !== "string" || !raw.sdkVersion.trim()) {
    return { ok: false, message: "sdkVersion is required" };
  }

  if (typeof raw.requestId !== "string" || !raw.requestId.trim()) {
    return { ok: false, message: "requestId is required" };
  }

  if (typeof raw.type !== "string" || !ALLOWED_EVENT_TYPES.has(raw.type as HostBridgeEventType)) {
    return { ok: false, message: "Invalid or missing event type" };
  }

  const eventType = raw.type as HostBridgeEventType;

  if (eventType === "host.page.ready") {
    const pageContext = parsePageContext(raw.pageContext);
    if (!pageContext) {
      return { ok: false, message: "pageContext is required for host.page.ready" };
    }

    const action =
      typeof raw.action === "string" && ALLOWED_ACTIONS.has(raw.action as HostBridgeAction)
        ? (raw.action as HostBridgeAction)
        : undefined;

    const event: HostPageReadyEvent = {
      source: "host-web",
      protocolVersion: "6.0",
      sdkVersion: raw.sdkVersion,
      requestId: raw.requestId,
      type: "host.page.ready",
      formType: typeof raw.formType === "string" ? raw.formType : undefined,
      action,
      pageContext,
    };
    return { ok: true, event };
  }

  const trigger = parseTrigger(raw.trigger, true);
  if (!trigger) {
    return { ok: false, message: "trigger.type must be user-click with timestamp" };
  }

  if (typeof raw.formType !== "string" || !raw.formType.trim()) {
    return { ok: false, message: "formType is required" };
  }

  if (!ALLOWED_ACTIONS.has(raw.action as HostBridgeAction)) {
    return { ok: false, message: "action must be create, edit, view, or analytic" };
  }

  const action = raw.action as HostBridgeAction;

  if (options?.allowedFormTypes && !options.allowedFormTypes.includes(raw.formType)) {
    return { ok: false, message: "formType is not allowed" };
  }

  if (options?.allowedActions && !options.allowedActions.includes(action)) {
    return { ok: false, message: "action is not allowed" };
  }

  if ((action === "create" || action === "edit") && typeof raw.callbackUrl !== "string") {
    return { ok: false, message: "callbackUrl is required for create/edit" };
  }

  const pageContext = parsePageContext(raw.pageContext);
  if (!pageContext) {
    return { ok: false, message: "pageContext is required" };
  }

  if (hasForbiddenSecrets(pageContext.data)) {
    return { ok: false, message: "pageContext contains forbidden secret fields" };
  }

  const event: HostBridgeSubmitEvent = {
    source: "host-web",
    protocolVersion: "6.0",
    sdkVersion: raw.sdkVersion,
    requestId: raw.requestId,
    type: "host.bridge.submit",
    formType: raw.formType,
    action,
    callbackUrl: typeof raw.callbackUrl === "string" ? raw.callbackUrl : undefined,
    skillName: typeof raw.skillName === "string" ? raw.skillName : undefined,
    trigger,
    pageContext,
  };

  return { ok: true, event };
}

export function estimateHostPayloadBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

export { hasForbiddenSecrets };
