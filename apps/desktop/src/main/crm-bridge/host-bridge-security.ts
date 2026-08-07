import type { WebContents, WebFrameMain } from "electron";
import type {
  HostBridgeEmitInput,
  HostBridgeResult,
  HostBridgeSubmitEvent,
  HostPageReadyEvent,
} from "../../shared/crm-bridge/host-bridge-contract";
import {
  adaptLegacyCrmEventToHost,
  isLegacyCrmBridgeEvent,
} from "../../shared/crm-bridge/host-bridge-legacy-adapter";
import {
  estimateHostPayloadBytes,
  validateHostBridgeEventSchema,
} from "../../shared/crm-bridge/host-bridge-schema";
import {
  getHostBridgeConfig,
  isHostCallbackUrlAllowed,
  isHostOriginAllowed,
} from "./host-bridge-config";
import { hasDuplicateHostRequestId, markHostRequestId } from "./host-event-store";
import { getWebOperatorTabWebContentsId } from "../browser/web-operator-tabs";

export interface ValidateHostBridgeEventParams {
  sender: WebContents;
  frame: WebFrameMain | null;
  input: HostBridgeEmitInput;
  requireGesture?: boolean;
}

export interface ValidateHostBridgeEventSuccess {
  ok: true;
  event: HostBridgeSubmitEvent | HostPageReadyEvent;
  origin: string;
}

export type ValidateHostBridgeEventOutcome = ValidateHostBridgeEventSuccess | HostBridgeResult;

function failure(
  requestId: string,
  errorCode: NonNullable<HostBridgeResult["errorCode"]>,
  message: string,
): HostBridgeResult {
  return { ok: false, requestId, errorCode, message };
}

function normalizeInputEvent(raw: unknown): unknown {
  if (isLegacyCrmBridgeEvent(raw)) {
    return adaptLegacyCrmEventToHost(raw) ?? raw;
  }
  return raw;
}

function isWebOperatorSender(sender: WebContents): boolean {
  const primaryId = getWebOperatorTabWebContentsId(null);
  if (primaryId !== null && sender.id === primaryId) {
    return true;
  }

  const tabIds = getWebOperatorTabWebContentsId("any");
  if (Array.isArray(tabIds)) {
    return tabIds.includes(sender.id);
  }

  return false;
}

export function validateHostBridgeEvent(
  params: ValidateHostBridgeEventParams,
): ValidateHostBridgeEventOutcome {
  const config = getHostBridgeConfig();

  if (!config.enabled) {
    return failure("", "HOST_BRIDGE_DISABLED", "Host bridge is disabled");
  }

  if (!isWebOperatorSender(params.sender)) {
    return failure("", "ORIGIN_NOT_ALLOWED", "Event sender is not WebOperator WebContents");
  }

  const normalizedRaw = normalizeInputEvent(params.input?.event);
  const schema = validateHostBridgeEventSchema(normalizedRaw, {
    allowedFormTypes: config.allowedFormTypes,
    allowedActions: config.allowedActions,
  });

  if (!schema.ok || !schema.event) {
    return failure(
      typeof (params.input?.event as { requestId?: string })?.requestId === "string"
        ? (params.input.event as { requestId: string }).requestId
        : "",
      "INVALID_SCHEMA",
      schema.message ?? "Invalid Host bridge event schema",
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

  const origin = originFromFrame;
  const inputOrigin = params.input.location?.origin ?? "";

  if (!origin) {
    return failure(event.requestId, "INVALID_SCHEMA", "Missing senderFrame url for origin check");
  }

  if (inputOrigin && inputOrigin !== origin) {
    return failure(event.requestId, "ORIGIN_NOT_ALLOWED", "Input origin mismatch senderFrame origin");
  }

  if (!isHostOriginAllowed(origin, config)) {
    return failure(event.requestId, "ORIGIN_NOT_ALLOWED", "Origin is not in allowlist");
  }

  if (event.type === "host.bridge.submit") {
    /*
    if (config.allowedSkills.length > 0 && event.skillName) {
      if (!config.allowedSkills.includes(event.skillName)) {
        return failure(event.requestId, "SKILL_NOT_ALLOWED", "skillName is not allowed");
      }
    }
    */

    if (event.callbackUrl && !isHostCallbackUrlAllowed(event.callbackUrl, config)) {
      return failure(
        event.requestId,
        "CALLBACK_URL_NOT_ALLOWED",
        "callbackUrl origin is not in allowlist",
      );
    }
  }

  const payloadBytes = estimateHostPayloadBytes(event);
  if (payloadBytes > config.payloadMaxBytes) {
    return failure(event.requestId, "PAYLOAD_TOO_LARGE", "Payload exceeds size limit");
  }

  if (hasDuplicateHostRequestId(event.requestId)) {
    return failure(event.requestId, "DUPLICATE_REQUEST", "Duplicate requestId");
  }

  markHostRequestId(event.requestId);

  return { ok: true, event, origin };
}
