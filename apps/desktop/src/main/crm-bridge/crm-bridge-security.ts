import type { WebContents, WebFrameMain } from "electron";
import type {
  CrmBridgeEmitInput,
  CrmBridgeEvent,
  CrmBridgeResult,
} from "../../shared/crm-bridge/crm-bridge-contract";
import {
  estimatePayloadBytes,
  validateCrmBridgeEventSchema,
} from "../../shared/crm-bridge/crm-bridge-schema";
import { getCrmBridgeConfig, isOriginAllowed } from "./crm-bridge-config";
import { hasDuplicateRequestId, markRequestId } from "./crm-event-store";
import type { BrowserViewPort } from "../browser/browser-viewport";

export interface ValidateCrmBridgeEventParams {
  sender: WebContents;
  frame: WebFrameMain | null;
  input: CrmBridgeEmitInput;
  viewManager: BrowserViewPort;
}

export interface ValidateCrmBridgeEventSuccess {
  ok: true;
  event: CrmBridgeEvent;
  origin: string;
}

export type ValidateCrmBridgeEventOutcome =
  | ValidateCrmBridgeEventSuccess
  | CrmBridgeResult;

function failure(
  requestId: string,
  errorCode: NonNullable<CrmBridgeResult["errorCode"]>,
  message: string,
): CrmBridgeResult {
  return {
    ok: false,
    requestId,
    errorCode,
    message,
  };
}

export function validateCrmBridgeEvent(
  params: ValidateCrmBridgeEventParams,
): ValidateCrmBridgeEventOutcome {
  const config = getCrmBridgeConfig();

  if (!config.enabled) {
    return failure("", "CRM_BRIDGE_DISABLED", "CRM bridge is disabled");
  }

  const operatorWc = params.viewManager.getExternalWebContents();
  if (!operatorWc || operatorWc.isDestroyed()) {
    return failure("", "WEB_OPERATOR_NOT_READY", "WebOperator view is not ready");
  }

  if (params.sender.id !== operatorWc.id) {
    return failure("", "ORIGIN_NOT_ALLOWED", "Event sender is not WebOperator WebContents");
  }

  const schema = validateCrmBridgeEventSchema(params.input?.event);
  if (!schema.ok || !schema.event) {
    return failure(
      typeof (params.input?.event as { requestId?: string })?.requestId === "string"
        ? (params.input.event as { requestId: string }).requestId
        : "",
      "INVALID_SCHEMA",
      schema.message ?? "Invalid CRM bridge event schema",
    );
  }

  const event = schema.event;
  const frameUrl = params.frame?.url ?? "";
  let originFromFrame = "";
  try {
    originFromFrame = frameUrl ? new URL(frameUrl).origin : "";
  } catch {
    originFromFrame = "";
  }

  // Per PRD: senderFrame.url is the source of truth for origin.
  const origin = originFromFrame;
  const inputOrigin = params.input.location?.origin ?? "";

  if (!origin) {
    return failure(event.requestId, "INVALID_SCHEMA", "Missing senderFrame url for origin check");
  }

  if (inputOrigin && inputOrigin !== origin) {
    return failure(event.requestId, "ORIGIN_NOT_ALLOWED", "Input origin mismatch senderFrame origin");
  }

  if (!origin || !isOriginAllowed(origin, config.allowedOrigins)) {
    return failure(event.requestId, "ORIGIN_NOT_ALLOWED", "Origin is not in allowlist");
  }

  if (!config.allowedEventTypes.includes(event.type)) {
    return failure(event.requestId, "EVENT_TYPE_NOT_ALLOWED", "Event type is not allowed");
  }

  const payloadBytes = estimatePayloadBytes(event);
  if (payloadBytes > config.payloadMaxBytes) {
    return failure(event.requestId, "PAYLOAD_TOO_LARGE", "Payload exceeds size limit");
  }

  if (hasDuplicateRequestId(event.requestId)) {
    return failure(event.requestId, "DUPLICATE_REQUEST", "Duplicate requestId");
  }

  markRequestId(event.requestId);

  return { ok: true, event, origin };
}
