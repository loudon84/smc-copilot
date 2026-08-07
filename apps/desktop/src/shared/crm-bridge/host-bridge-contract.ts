/** V6.0 HostBridge — protocol version */
export const HOST_BRIDGE_PROTOCOL_VERSION = "6.0" as const;

export type HostBridgeAction = "create" | "edit" | "view" | "analytic";

export type HostBridgeEventType = "host.bridge.submit" | "host.page.ready";

export type HostBridgeErrorCode =
  | "HOST_BRIDGE_DISABLED"
  | "ORIGIN_NOT_ALLOWED"
  | "EVENT_TYPE_NOT_ALLOWED"
  | "PAYLOAD_TOO_LARGE"
  | "USER_GESTURE_REQUIRED"
  | "INVALID_SCHEMA"
  | "WEB_OPERATOR_NOT_READY"
  | "ROUTE_NOT_FOUND"
  | "DUPLICATE_REQUEST"
  | "COMMAND_ACK_TIMEOUT"
  | "COMMAND_ACK_INVALID"
  | "CALLBACK_URL_NOT_ALLOWED"
  | "FORM_TYPE_NOT_ALLOWED"
  | "ACTION_NOT_ALLOWED"
  | "SKILL_NOT_ALLOWED"
  | "UNKNOWN_ERROR"
  | "CRM_BRIDGE_DISABLED"
  | "INVALID_SCHEMA";

export interface HostBridgeTrigger {
  type: "user-click";
  elementId?: string;
  label?: string;
  timestamp: string;
}

export interface HostBridgePageContext {
  app: string;
  url: string;
  title?: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  fields?: Record<string, string | number | boolean | null>;
  selectedIds?: string[];
  safeText?: string;
  data?: Record<string, unknown>;
}

export interface HostBridgeSubmitEvent {
  source: "host-web";
  protocolVersion: typeof HOST_BRIDGE_PROTOCOL_VERSION;
  sdkVersion: string;
  requestId: string;
  type: "host.bridge.submit";
  formType: string;
  action: HostBridgeAction;
  callbackUrl?: string;
  skillName?: string;
  trigger: HostBridgeTrigger;
  pageContext: HostBridgePageContext;
}

export interface HostPageReadyEvent {
  source: "host-web";
  protocolVersion: typeof HOST_BRIDGE_PROTOCOL_VERSION;
  sdkVersion: string;
  requestId: string;
  type: "host.page.ready";
  formType?: string;
  action?: HostBridgeAction;
  pageContext: {
    app: string;
    url: string;
    title?: string;
    entityType?: string;
    entityId?: string;
    entityName?: string;
  };
}

export type HostBridgeEvent = HostBridgeSubmitEvent | HostPageReadyEvent;

export interface HostBridgeResult {
  ok: boolean;
  requestId: string;
  action?: string;
  message?: string;
  errorCode?: HostBridgeErrorCode;
  data?: Record<string, unknown>;
}

export type HostDesktopCommandType =
  | "desktop.host.form.fill"
  | "desktop.host.form.patch"
  | "desktop.host.form.submit"
  | "desktop.host.showToast"
  | "desktop.host.focusField"
  | "desktop.host.highlightField"
  | "desktop.host.clickButton"
  | "desktop.host.requestContext";

export interface DesktopHostFormFillCommand {
  commandId: string;
  type: "desktop.host.form.fill";
  formType: string;
  action: "create" | "edit";
  payload: {
    fields: Record<string, unknown>;
    subTables?: Record<string, Array<Record<string, unknown>>>;
    meta?: Record<string, unknown>;
  };
  createdAt: string;
  expectAck: true;
  timeoutMs?: number;
}

export interface HostDesktopCommand {
  commandId: string;
  type: HostDesktopCommandType | string;
  formType?: string;
  action?: string;
  target?: {
    selector?: string;
    fieldName?: string;
    entityId?: string;
    frameId?: string;
    actionKey?: string;
  };
  payload?: Record<string, unknown>;
  createdAt: string;
  expectAck?: boolean;
  timeoutMs?: number;
}

export interface HostDesktopCommandAck {
  commandId: string;
  ok: boolean;
  type: string;
  action?: string;
  message?: string;
  data?: Record<string, unknown>;
  errorCode?: string;
  receivedAt: string;
  completedAt: string;
}

export interface HostSkillRunResult {
  ok: boolean;
  requestId: string;
  skillName?: string;
  message?: string;
  fillFormPayload?: {
    fields: Record<string, unknown>;
    subTables?: Record<string, Array<Record<string, unknown>>>;
    meta?: Record<string, unknown>;
  };
  analysisResult?: Record<string, unknown>;
  errorCode?: string;
}

export type WebOperatorTabStatus = "loading" | "ready" | "failed";

export type WebOperatorTabKind = "normal" | "host-callback";

export interface WebOperatorTab {
  tabId: string;
  title: string;
  url: string;
  status: WebOperatorTabStatus;
  kind: WebOperatorTabKind;
  webContentsId?: number;
  hostBridge?: {
    requestId?: string;
    formType?: string;
    action?: HostBridgeAction;
    callbackUrl?: string;
    handoffId?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type HostHandoffStatus =
  | "pending"
  | "callback-opening"
  | "callback-loaded"
  | "ready-received"
  | "delivering"
  | "delivered"
  | "failed"
  | "expired";

export interface HostHandoffRecord {
  handoffId: string;
  requestId: string;
  tabId?: string;
  formType: string;
  action: "create" | "edit";
  callbackUrl: string;
  callbackOrigin: string;
  skillName?: string;
  sourceEvent: HostBridgeSubmitEvent;
  fillFormPayload: {
    fields: Record<string, unknown>;
    subTables?: Record<string, Array<Record<string, unknown>>>;
    meta?: Record<string, unknown>;
  };
  status: HostHandoffStatus;
  commandId?: string;
  ack?: HostDesktopCommandAck;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  lastError?: string;
}

export type HostBridgeRouteAction =
  | "open-web-operator-panel"
  | "open-hermes-skill"
  | "open-renderer-route"
  | "refresh-snapshot";

export interface HostBridgeRouteConfig {
  formType: string;
  action: HostBridgeAction;
  skillName?: string;
  desktopAction: HostBridgeRouteAction;
  focusedPanel?: string;
  callbackMode?: "open-tab-fill-form";
  route?: string;
  refreshSnapshot?: boolean;
}

export interface HostBridgeRouteResult {
  ok: boolean;
  action?: string;
  focusedPanel?: string;
  refreshSnapshot?: boolean;
  route?: string;
  message?: string;
  callbackMode?: string;
}

export interface HostBridgeStoredEvent extends HostBridgeSubmitEvent {
  webContentsId?: number;
  origin?: string;
  createdAt: string;
}

export interface HostBridgeStoredReadyEvent extends HostPageReadyEvent {
  webContentsId?: number;
  origin?: string;
  createdAt: string;
}

export interface HostBridgeEmitInput {
  event: unknown;
  location?: {
    href: string;
    origin: string;
    title?: string;
  };
  receivedAt?: string;
}

export interface HostBridgeOnEventPayload {
  event: HostBridgeStoredEvent | HostBridgeStoredReadyEvent;
  routeAction: HostBridgeRouteResult;
}

export const HostBridgeEvents = {
  ON_EVENT: "host-bridge:on-event",
  COMMAND: "host-bridge:command",
  COMMAND_RESULT: "host-bridge:command-result",
  TABS_CHANGED: "host-bridge:tabs-changed",
} as const;

export const ALLOWED_HOST_BRIDGE_EVENT_TYPES: readonly HostBridgeEventType[] = [
  "host.bridge.submit",
  "host.page.ready",
] as const;

export interface HostBridgeSiteConfig {
  siteId: string;
  name: string;
  enabled: boolean;
  allowedOrigins: string[];
}

export interface HostBridgeConfigFile {
  version: string;
  enabled: boolean;
  payloadMaxBytes: number;
  trustedGestureWindowMs: number;
  sites: HostBridgeSiteConfig[];
  allowedFormTypes: string[];
  allowedActions: string[];
  allowedSkills: string[];
  routes: HostBridgeRouteConfig[];
  security: {
    forbiddenPayloadKeys: string[];
    allowWildcardSubdomain: boolean;
    requireUserGesture: boolean;
  };
}

export const ALLOWED_HOST_DESKTOP_COMMAND_TYPES: readonly HostDesktopCommandType[] = [
  "desktop.host.form.fill",
  "desktop.host.form.patch",
  "desktop.host.form.submit",
  "desktop.host.showToast",
  "desktop.host.focusField",
  "desktop.host.highlightField",
  "desktop.host.clickButton",
  "desktop.host.requestContext",
] as const;
