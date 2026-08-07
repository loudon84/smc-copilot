export type CrmBridgeEventType =
  | "crm.context.submit"
  | "crm.product.context.submit"
  | "crm.customer.open-ai-panel"
  | "crm.quote.create-assist"
  | "crm.order.risk-check"
  | "crm.page.snapshot-request"
  | "crm.page.ready";

export type CrmBridgeErrorCode =
  | "CRM_BRIDGE_DISABLED"
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
  | "UNKNOWN_ERROR";

export interface CrmBridgeTrigger {
  type: "user-click";
  elementId?: string;
  label?: string;
  timestamp: string;
}

export interface SupplierSupplyPayload {
  supplierId: string;
  supplierName: string;
  supplyPrice: number;
  stockQty: number;
  moq: number;
  leadTimeDays: number;
  status: string;
  remark?: string;
}

export interface ProductPayload {
  id?: string;
  sku: string;
  brand: string;
  model: string;
  productName: string;
  series?: string;
  os?: string;
  chipset?: string;
  screenSize?: string;
  ram?: string;
  storage?: string;
  color?: string;
  batteryMah?: number;
  network?: string;
  retailPrice?: number;
  status?: string;
  launchDate?: string;
  description?: string;
  suppliers?: SupplierSupplyPayload[];
}

export interface CrmProductContextPayload {
  product: ProductPayload;
}

export interface CrmPageContext {
  app: "crm" | "crm-lite";
  entityType?:
    | "customer"
    | "contact"
    | "lead"
    | "opportunity"
    | "quote"
    | "order"
    | "product";
  entityId?: string;
  entityName?: string;
  url: string;
  title?: string;
  selectedIds?: string[];
  fields?: Record<string, string | number | boolean | null>;
  safeText?: string;
}

export interface CrmBridgeEvent {
  source: "crm-web";
  sdkVersion: string;
  requestId: string;
  type: CrmBridgeEventType;
  trigger: CrmBridgeTrigger;
  page: CrmPageContext;
  payload?: Record<string, unknown>;
}

export interface CrmBridgeResult {
  ok: boolean;
  requestId: string;
  action?: string;
  message?: string;
  errorCode?: CrmBridgeErrorCode;
}

export type CrmDesktopCommandType =
  | "desktop.crm.showToast"
  | "desktop.crm.highlightField"
  | "desktop.crm.focusField"
  | "desktop.crm.fillField"
  | "desktop.crm.scrollToSection"
  | "desktop.crm.requestContext"
  | "desktop.crm.clickButton"
  | "desktop.crm.runAction"
  | "desktop.crm.pushJson"
  | "desktop.crm.product.fillForm"
  | "desktop.crm.product.create";

/** V5.7.10 crm-lite demo — allowed CRM → Desktop event types */
export const ALLOWED_CRM_BRIDGE_EVENT_TYPES: readonly CrmBridgeEventType[] = [
  "crm.context.submit",
  "crm.product.context.submit",
  "crm.customer.open-ai-panel",
  "crm.quote.create-assist",
  "crm.order.risk-check",
  "crm.page.snapshot-request",
  "crm.page.ready",
] as const;

/** V5.7.10 crm-lite demo — allowed Desktop → CRM command types */
export const ALLOWED_CRM_DESKTOP_COMMAND_TYPES: readonly CrmDesktopCommandType[] = [
  "desktop.crm.showToast",
  "desktop.crm.highlightField",
  "desktop.crm.focusField",
  "desktop.crm.fillField",
  "desktop.crm.scrollToSection",
  "desktop.crm.requestContext",
  "desktop.crm.clickButton",
  "desktop.crm.runAction",
  "desktop.crm.pushJson",
  "desktop.crm.product.fillForm",
  "desktop.crm.product.create",
] as const;

export interface CrmDesktopCommand {
  commandId: string;
  type: CrmDesktopCommandType;
  target?: {
    selector?: string;
    fieldName?: string;
    entityId?: string;
    frameId?: string;
    actionKey?: string;
  };
  payload?: Record<string, unknown>;
  createdAt: string;
  /** true: wait for CRM JSSDK ack; false: fire-and-forget. */
  expectAck?: boolean;
  /** Default 8000ms when expectAck is true. */
  timeoutMs?: number;
}

export interface CrmDesktopCommandAck {
  commandId: string;
  ok: boolean;
  type: CrmDesktopCommandType;
  action?: string;
  message?: string;
  data?: Record<string, unknown>;
  errorCode?: string;
  receivedAt: string;
  completedAt: string;
}

export type CrmBridgeRouteAction =
  | "open-web-operator-panel"
  | "open-renderer-route"
  | "refresh-snapshot";

export interface CrmBridgeRouteConfig {
  action: CrmBridgeRouteAction;
  focusedPanel?: string;
  refreshSnapshot?: boolean;
  route?: string;
}

export interface CrmBridgeRouteResult {
  ok: boolean;
  action?: string;
  focusedPanel?: string;
  refreshSnapshot?: boolean;
  route?: string;
  message?: string;
}

export interface CrmBridgeStoredEvent extends CrmBridgeEvent {
  webContentsId?: number;
  origin?: string;
  createdAt: string;
}

export interface CrmBridgeEmitInput {
  event: unknown;
  location?: {
    href: string;
    origin: string;
    title?: string;
  };
  receivedAt?: string;
}

export interface CrmBridgeOnEventPayload {
  event: CrmBridgeStoredEvent;
  routeAction: CrmBridgeRouteResult;
}

export const CrmBridgeEvents = {
  ON_EVENT: "crm-bridge:on-event",
  COMMAND: "crm-bridge:command",
  COMMAND_RESULT: "crm-bridge:command-result",
} as const;
