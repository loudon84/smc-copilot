export type {
  CrmBridgeEventType,
  CrmBridgeErrorCode,
  CrmBridgeTrigger,
  SupplierSupplyPayload,
  ProductPayload,
  CrmProductContextPayload,
  CrmPageContext,
  CrmBridgeEvent,
  CrmBridgeResult,
  CrmDesktopCommandType,
  CrmDesktopCommand,
  CrmDesktopCommandAck,
  CrmBridgeRouteAction,
  CrmBridgeRouteConfig,
  CrmBridgeRouteResult,
  CrmBridgeStoredEvent,
  CrmBridgeEmitInput,
  CrmBridgeOnEventPayload,
} from "./crm-bridge-contract";

export {
  CrmBridgeEvents,
  ALLOWED_CRM_BRIDGE_EVENT_TYPES,
  ALLOWED_CRM_DESKTOP_COMMAND_TYPES,
} from "./crm-bridge-contract";

export type {
  CrmBridgeAuditAction,
  CrmBridgeAuditStatus,
  CrmBridgeAuditRecord,
} from "./crm-bridge-errors";

export { createCrmBridgeError } from "./crm-bridge-errors";

export type { CrmBridgeSchemaValidation } from "./crm-bridge-schema";

export {
  validateCrmBridgeEventSchema,
  estimatePayloadBytes,
} from "./crm-bridge-schema";

export {
  CRM_RENDERER_ROUTES,
  CRM_RENDERER_ROUTE_DEFINITIONS,
  resolveCrmRendererRoute,
  isCrmRendererRoutePath,
} from "./crm-renderer-routes";

export type {
  CrmRendererRoutePath,
  CrmRendererRouteId,
  CrmRendererRouteDefinition,
} from "./crm-renderer-routes";

export type {
  HostBridgeAction,
  HostBridgeEventType,
  HostBridgeErrorCode,
  HostBridgeTrigger,
  HostBridgePageContext,
  HostBridgeSubmitEvent,
  HostPageReadyEvent,
  HostBridgeEvent,
  HostBridgeResult,
  HostDesktopCommandType,
  DesktopHostFormFillCommand,
  HostDesktopCommand,
  HostDesktopCommandAck,
  HostSkillRunResult,
  WebOperatorTabStatus,
  WebOperatorTabKind,
  WebOperatorTab,
  HostHandoffStatus,
  HostHandoffRecord,
  HostBridgeRouteAction,
  HostBridgeRouteConfig,
  HostBridgeRouteResult,
  HostBridgeStoredEvent,
  HostBridgeStoredReadyEvent,
  HostBridgeEmitInput,
  HostBridgeOnEventPayload,
  HostBridgeConfigFile,
  HostBridgeSiteConfig,
} from "./host-bridge-contract";

export {
  HOST_BRIDGE_PROTOCOL_VERSION,
  HostBridgeEvents,
  ALLOWED_HOST_BRIDGE_EVENT_TYPES,
  ALLOWED_HOST_DESKTOP_COMMAND_TYPES,
} from "./host-bridge-contract";

export type {
  HostBridgeAuditAction,
  HostBridgeAuditStatus,
  HostBridgeAuditRecord,
} from "./host-bridge-errors";

export { createHostBridgeError } from "./host-bridge-errors";

export type { HostBridgeSchemaValidation } from "./host-bridge-schema";

export {
  validateHostBridgeEventSchema,
  estimateHostPayloadBytes,
  hasForbiddenSecrets,
} from "./host-bridge-schema";

export {
  isLegacyCrmBridgeEvent,
  adaptLegacyCrmEventToHost,
  normalizeHostDesktopCommandType,
  adaptLegacyCommandToHost,
  hostEventToCrmBridgeEvent,
} from "./host-bridge-legacy-adapter";
