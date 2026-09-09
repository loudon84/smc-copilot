/**
 * Skill Run Event & Snapshot Parser.
 * Maps wire events and run status to Work-safe projection updates.
 * Owns Catalog normalize/classify and prompt-first binding (shared by Catalog + Start).
 */

import type {
  SkillCatalogToolItem,
  SkillInvocationMode,
  SkillInvocationReasonCode,
  SkillRunArtifactDescriptor,
  SkillRunExtraStringField,
  SkillRunLocalPhase,
} from "../../shared/skill-run";
import { hasSkillRunStreamingDeltaBundle } from "./skill-run-consumer-lock";

export type BindPromptFirstErrorCode =
  | "TOOL_NOT_FOUND"
  | "TOOL_NOT_CALLABLE"
  | "SKILL_FORM_REQUIRED"
  | "SKILL_PARAMETERS_REQUIRED"
  | "SKILL_PROMPT_FIELD_MISSING"
  | "SKILL_PROMPT_FIELD_INVALID"
  | "SKILL_UNSUPPORTED_SCHEMA"
  | "SKILL_CONTRACT_MISMATCH";

export type BindPromptFirstResult =
  | {
      ok: true;
      tool: SkillCatalogToolItem;
      promptField: string;
      arguments: Record<string, unknown>;
    }
  | { ok: false; errorCode: BindPromptFirstErrorCode; message: string };

export interface SkillInvocationClassification {
  invocationMode: SkillInvocationMode;
  callability: SkillCatalogToolItem["callability"];
  reasonCode?: SkillInvocationReasonCode;
  promptField?: string | null;
  extraStringFields?: SkillRunExtraStringField[];
}

/** Intermediate descriptor after wire normalize; classification applied next. */
export interface NormalizedSkillToolDescriptor {
  toolName: string;
  title: string;
  description?: string;
  category?: string;
  interactionMode: "chat" | "form";
  promptField?: string | null;
  supportsAttachments: boolean;
  inputSchema?: Record<string, unknown>;
}

const ACTIVITY_STRING_MAX = 512;
const CLARIFY_OPTIONS_MAX = 8;
const EXTRA_STRING_FIELDS_MAX = 8;

type ParsedToolCallStatus = "started" | "completed" | "failed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clipDisplayString(
  value: unknown,
  max = ACTIVITY_STRING_MAX,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function isToolCallStatus(value: unknown): value is ParsedToolCallStatus {
  return (
    value === "started" || value === "completed" || value === "failed"
  );
}

function sanitizeClarifyOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (out.length >= CLARIFY_OPTIONS_MAX) break;
    const label = clipDisplayString(entry);
    if (label) out.push(label);
  }
  return out;
}

function unknownEvent(
  eventId: string | undefined,
  eventSeq: number | undefined,
): ParsedSkillRunEvent {
  return {
    eventId,
    eventSeq,
    rawUnknown: true,
  };
}

function isDeltaSeq(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function reasonToErrorCode(
  reasonCode: SkillInvocationReasonCode | undefined,
): BindPromptFirstErrorCode {
  switch (reasonCode) {
    case "FORM_REQUIRED":
      return "SKILL_FORM_REQUIRED";
    case "EXTRA_REQUIRED_PARAMETERS":
      return "SKILL_PARAMETERS_REQUIRED";
    case "PROMPT_FIELD_MISSING":
      return "SKILL_PROMPT_FIELD_MISSING";
    case "PROMPT_FIELD_INVALID":
      return "SKILL_PROMPT_FIELD_INVALID";
    case "CONTRACT_MISMATCH":
      return "SKILL_CONTRACT_MISMATCH";
    case "ROOT_SCHEMA_UNSUPPORTED":
    case "COMPOSITE_SCHEMA_UNSUPPORTED":
    default:
      return "SKILL_UNSUPPORTED_SCHEMA";
  }
}

function classifyUnsupported(
  reasonCode: SkillInvocationReasonCode,
  invocationMode: SkillInvocationMode = "unsupported-schema",
): SkillInvocationClassification {
  return {
    invocationMode,
    callability: "unsupported",
    reasonCode,
  };
}

/**
 * Parse one v1.2.1 Catalog descriptor. Non-skill capabilityKind or missing
 * name/interactionMode returns null (filtered from Catalog projection).
 */
export function normalizeSkillToolDescriptor(
  raw: unknown,
): NormalizedSkillToolDescriptor | null {
  if (!isRecord(raw) || typeof raw.name !== "string" || !raw.name.trim()) {
    return null;
  }
  if (raw.capabilityKind !== "skill") {
    return null;
  }
  if (raw.interactionMode !== "chat" && raw.interactionMode !== "form") {
    return null;
  }

  const toolName = raw.name.trim();
  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim()
      : toolName;

  let promptField: string | null | undefined;
  if (raw.promptField === null) {
    promptField = null;
  } else if (typeof raw.promptField === "string") {
    promptField = raw.promptField;
  } else {
    promptField = undefined;
  }

  return {
    toolName,
    title,
    description: typeof raw.description === "string" ? raw.description : undefined,
    category: typeof raw.category === "string" ? raw.category : undefined,
    interactionMode: raw.interactionMode,
    promptField,
    supportsAttachments: raw.supportsAttachments === true,
    inputSchema: isRecord(raw.inputSchema) ? raw.inputSchema : undefined,
  };
}

function isPureStringProperty(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.type === "string" && !(typeof value.$ref === "string" && value.$ref.trim());
}

function extraStringFieldsForRequired(
  properties: Record<string, unknown>,
  extraRequired: string[],
): SkillRunExtraStringField[] | null {
  if (extraRequired.length === 0 || extraRequired.length > EXTRA_STRING_FIELDS_MAX) {
    return null;
  }
  const fields: SkillRunExtraStringField[] = [];
  for (const name of extraRequired) {
    const prop = properties[name];
    if (!isPureStringProperty(prop)) {
      return null;
    }
    const title =
      typeof prop.title === "string" && prop.title.trim()
        ? prop.title.trim()
        : undefined;
    fields.push(title ? { name, title } : { name });
  }
  return fields;
}

/**
 * Single invocation classification owner for Catalog projection and Main start.
 * Optional complex properties do not disqualify prompt-first (PRD 5.4 / AC-04).
 * Extra required string scalars (1–8) are limited-parameter-form; form without extras stays form-required.
 */
export function classifySkillInvocation(
  tool: Pick<
    NormalizedSkillToolDescriptor,
    "interactionMode" | "promptField" | "inputSchema"
  >,
): SkillInvocationClassification {
  const schema = tool.inputSchema;
  if (schema) {
    if (typeof schema.$ref === "string" && schema.$ref.trim()) {
      return classifyUnsupported("ROOT_SCHEMA_UNSUPPORTED");
    }
    if (schema.type !== undefined && schema.type !== "object") {
      return classifyUnsupported("ROOT_SCHEMA_UNSUPPORTED");
    }
    if (
      schema.oneOf ||
      schema.anyOf ||
      schema.allOf ||
      schema.if !== undefined ||
      schema.then !== undefined ||
      schema.else !== undefined ||
      schema.dependentRequired !== undefined ||
      schema.dependentSchemas !== undefined
    ) {
      return classifyUnsupported("COMPOSITE_SCHEMA_UNSUPPORTED");
    }
  }

  const promptField =
    typeof tool.promptField === "string" ? tool.promptField.trim() : "";
  if (!promptField) {
    return classifyUnsupported("PROMPT_FIELD_MISSING");
  }

  const props = schema && isRecord(schema.properties) ? schema.properties : null;
  if (!props || !(promptField in props)) {
    return classifyUnsupported("PROMPT_FIELD_MISSING");
  }

  const promptProp = props[promptField];
  if (!isPureStringProperty(promptProp)) {
    return classifyUnsupported("PROMPT_FIELD_INVALID");
  }

  const required = Array.isArray(schema?.required)
    ? schema.required.filter((field): field is string => typeof field === "string")
    : [];
  const extraRequired = required.filter((field) => field !== promptField);
  if (extraRequired.length === 0) {
    if (tool.interactionMode === "form") {
      return classifyUnsupported("FORM_REQUIRED", "form-required");
    }
    return {
      invocationMode: "prompt-first",
      callability: "callable",
      promptField,
    };
  }

  const extraStringFields = extraStringFieldsForRequired(props, extraRequired);
  if (extraStringFields) {
    return {
      invocationMode: "limited-parameter-form",
      callability: "callable",
      promptField,
      extraStringFields,
    };
  }

  if (tool.interactionMode === "form") {
    return classifyUnsupported("FORM_REQUIRED", "form-required");
  }
  return {
    invocationMode: "parameters-required",
    callability: "unsupported",
    reasonCode: "EXTRA_REQUIRED_PARAMETERS",
    promptField,
  };
}

/** Main-side Catalog revalidation: prompt-first and limited-parameter-form only; fail-closed on non-bindable schemas. */
export function bindPromptFirstTool(
  toolName: string,
  prompt: string,
  catalog: SkillCatalogToolItem[],
  extraParameters?: Record<string, string>,
): BindPromptFirstResult {
  const trimmedName = toolName.trim();
  const trimmedPrompt = prompt.trim();
  const tool = catalog.find((entry) => entry.toolName === trimmedName);
  if (!tool) {
    return {
      ok: false,
      errorCode: "TOOL_NOT_FOUND",
      message: `Skill tool not found in current catalog: ${trimmedName}`,
    };
  }

  const classification = classifySkillInvocation(tool);
  const extras = extraParameters ?? {};
  const extraKeys = Object.keys(extras);

  if (classification.invocationMode === "prompt-first") {
    if (extraKeys.length > 0) {
      return {
        ok: false,
        errorCode: "SKILL_PARAMETERS_REQUIRED",
        message: "Unexpected extra parameters for prompt-first skill",
      };
    }
  } else if (classification.invocationMode === "limited-parameter-form") {
    const allowed = classification.extraStringFields ?? [];
    const allowedNames = new Set(allowed.map((field) => field.name));
    for (const key of extraKeys) {
      if (!allowedNames.has(key)) {
        return {
          ok: false,
          errorCode: "SKILL_PARAMETERS_REQUIRED",
          message: "Unknown extra parameter is not allowed",
        };
      }
    }
    for (const field of allowed) {
      const value = extras[field.name];
      if (typeof value !== "string" || !value.trim()) {
        return {
          ok: false,
          errorCode: "SKILL_PARAMETERS_REQUIRED",
          message: "Additional required parameters are not supported",
        };
      }
    }
  } else {
    return {
      ok: false,
      errorCode: reasonToErrorCode(classification.reasonCode),
      message:
        classification.reasonCode === "EXTRA_REQUIRED_PARAMETERS"
          ? "Additional required parameters are not supported"
          : classification.reasonCode === "FORM_REQUIRED"
            ? "Skill requires structured form input"
            : classification.reasonCode === "PROMPT_FIELD_MISSING"
              ? "Skill promptField is missing or invalid"
              : classification.reasonCode === "PROMPT_FIELD_INVALID"
                ? "Skill promptField must be a string property"
                : "Skill tool schema is not prompt-first compatible",
    };
  }

  const promptField = classification.promptField;
  if (typeof promptField !== "string" || !promptField.trim()) {
    return {
      ok: false,
      errorCode: "SKILL_PROMPT_FIELD_MISSING",
      message: "Skill promptField is missing or invalid",
    };
  }

  if (!trimmedPrompt) {
    return {
      ok: false,
      errorCode: "SKILL_PARAMETERS_REQUIRED",
      message: "Prompt is required for this skill",
    };
  }

  const argumentsPayload: Record<string, unknown> = {
    [promptField]: trimmedPrompt,
  };
  if (classification.invocationMode === "limited-parameter-form") {
    for (const field of classification.extraStringFields ?? []) {
      argumentsPayload[field.name] = extras[field.name].trim();
    }
  }

  return {
    ok: true,
    tool,
    promptField,
    arguments: argumentsPayload,
  };
}

export function mapPublicSkillCatalogTools(rawTools: unknown): SkillCatalogToolItem[] {
  if (!Array.isArray(rawTools)) return [];
  const out: SkillCatalogToolItem[] = [];
  for (const raw of rawTools) {
    const normalized = normalizeSkillToolDescriptor(raw);
    if (!normalized) continue;
    const classification = classifySkillInvocation(normalized);
    out.push({
      toolName: normalized.toolName,
      title: normalized.title,
      description: normalized.description,
      category: normalized.category,
      interactionMode: normalized.interactionMode,
      promptField: classification.promptField ?? normalized.promptField ?? null,
      supportsAttachments: normalized.supportsAttachments,
      callability: classification.callability,
      invocationMode: classification.invocationMode,
      reasonCode: classification.reasonCode,
      extraStringFields: classification.extraStringFields,
      inputSchema: normalized.inputSchema,
    });
  }
  return out;
}

/** Map a v1.2.1 PublicArtifactDescriptor into the Work-internal artifact DTO. */
export function mapPublicArtifactDescriptor(
  item: unknown,
): SkillRunArtifactDescriptor | null {
  if (!isRecord(item)) return null;
  const artifactId =
    typeof item.artifact_id === "string" ? item.artifact_id.trim() : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const checksum =
    typeof item.checksum_sha256 === "string" ? item.checksum_sha256.trim() : "";
  const sizeBytes = item.size_bytes;
  if (
    !artifactId ||
    !name ||
    !checksum ||
    typeof sizeBytes !== "number" ||
    !Number.isInteger(sizeBytes)
  ) {
    return null;
  }
  const descriptor: SkillRunArtifactDescriptor = {
    id: artifactId,
    file_name: name,
    size_bytes: sizeBytes,
    sha256: checksum,
  };
  if (typeof item.content_type === "string") {
    descriptor.mime_type = item.content_type;
  }
  if (typeof item.preview_supported === "boolean") {
    descriptor.preview_supported = item.preview_supported;
  }
  return descriptor;
}

/** Consume PublicArtifactList `items[]` (or equivalent arrays) with Bundle required fields only. */
export function mapPublicArtifactList(body: unknown): SkillRunArtifactDescriptor[] {
  let rawList: unknown[] = [];
  if (Array.isArray(body)) {
    rawList = body;
  } else if (isRecord(body)) {
    if (Array.isArray(body.items)) {
      rawList = body.items;
    } else if (Array.isArray(body.artifacts)) {
      rawList = body.artifacts;
    } else if (Array.isArray(body.data)) {
      rawList = body.data;
    }
  }
  const out: SkillRunArtifactDescriptor[] = [];
  for (const item of rawList) {
    const mapped = mapPublicArtifactDescriptor(item);
    if (mapped) out.push(mapped);
  }
  return out;
}

export type ParsedSkillRunActivityKind =
  | "reasoning.summary"
  | "tool.call"
  | "clarify.requested"
  | "approval.requested";

/** Work-owned sanitized activity; not a Provider event clone. Extra keys including arguments are never copied. */
export interface ParsedSkillRunActivity {
  kind: ParsedSkillRunActivityKind;
  summary?: string;
  toolName?: string;
  callId?: string;
  status?: ParsedToolCallStatus;
  question?: string;
  options?: string[];
  approvalId?: string;
}

export interface ParsedSkillRunEvent {
  eventId?: string;
  eventSeq?: number;
  phase?: SkillRunLocalPhase;
  displayStage?: string;
  text?: string;
  messageId?: string;
  deltaSeq?: number;
  deltaText?: string;
  errorCode?: string;
  errorMessage?: string;
  artifacts?: SkillRunArtifactDescriptor[];
  activity?: ParsedSkillRunActivity;
  rawUnknown?: boolean;
}

export function parseSkillRunStatusToPhase(status: string): SkillRunLocalPhase {
  switch (status?.toLowerCase()) {
    case "pending":
    case "queued":
      return "starting";
    case "running":
    case "in_progress":
      return "running";
    case "waiting_approval":
    case "approval_pending":
      return "waiting-approval";
    case "succeeded":
    case "completed":
      return "succeeded";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "expired":
    case "timed_out":
      return "expired";
    case "unauthorized":
      return "unauthorized";
    default:
      return "running";
  }
}

export function parseSkillRunEvent(
  eventType: string,
  payload: Record<string, unknown>,
): ParsedSkillRunEvent {
  const inner = isRecord(payload.payload) ? payload.payload : payload;
  const eventId =
    typeof payload.event_id === "string"
      ? payload.event_id
      : typeof payload.id === "string"
        ? payload.id
        : undefined;
  const eventSeq =
    typeof payload.event_seq === "number"
      ? payload.event_seq
      : typeof payload.seq === "number"
        ? payload.seq
        : undefined;
  const wireTypeRaw =
    typeof payload.event === "string"
      ? payload.event
      : typeof payload.event_type === "string"
        ? payload.event_type
        : eventType;
  const wireType = wireTypeRaw.toLowerCase();

  switch (wireType) {
    case "run.created":
    case "run.progress":
    case "run.started":
    case "run_started":
    case "task.started":
    case "task.progress":
    case "started":
    case "progress":
      return {
        eventId,
        eventSeq,
        phase: "running",
        displayStage: "Executing skill...",
        text:
          typeof inner.message === "string"
            ? inner.message
            : typeof inner.text === "string"
              ? inner.text
              : typeof payload.message === "string"
                ? payload.message
                : undefined,
      };

    case "run.waiting_approval":
    case "run_waiting_approval":
      return {
        eventId,
        eventSeq,
        phase: "waiting-approval",
        displayStage: "Waiting for approval...",
      };

    case "run.completed":
    case "run.succeeded":
    case "run_completed":
    case "task.completed":
    case "completed": {
      const artifactsSource =
        isRecord(inner) &&
        (Array.isArray(inner.items) ||
          Array.isArray(inner.artifacts) ||
          Array.isArray(inner.data))
          ? inner
          : payload;
      const artifacts = mapPublicArtifactList(artifactsSource);
      const resultObj = isRecord(inner.result)
        ? inner.result
        : isRecord(payload.result)
          ? payload.result
          : null;
      const text =
        typeof inner.text === "string"
          ? inner.text
          : typeof inner.result_text === "string"
            ? inner.result_text
            : typeof inner.message === "string"
              ? inner.message
              : resultObj && typeof resultObj.content === "string"
                ? resultObj.content
                : resultObj && typeof resultObj.summary === "string"
                  ? resultObj.summary
                  : typeof payload.result_text === "string"
                    ? payload.result_text
                    : typeof payload.text === "string"
                      ? payload.text
                      : undefined;

      return {
        eventId,
        eventSeq,
        phase: "succeeded",
        displayStage: "Skill completed successfully",
        text,
        artifacts: artifacts.length > 0 ? artifacts : undefined,
      };
    }

    case "assistant.message": {
      const messageId = clipDisplayString(inner.message_id);
      return {
        eventId,
        eventSeq,
        phase: "running",
        text: typeof inner.text === "string" ? inner.text : undefined,
        ...(messageId ? { messageId } : {}),
      };
    }

    case "assistant.delta": {
      if (!hasSkillRunStreamingDeltaBundle()) {
        return unknownEvent(eventId, eventSeq);
      }
      const messageId = clipDisplayString(inner.message_id);
      const deltaText = clipDisplayString(inner.delta);
      if (!messageId || !isDeltaSeq(inner.delta_seq) || !deltaText) {
        return unknownEvent(eventId, eventSeq);
      }
      return {
        eventId,
        eventSeq,
        phase: "running",
        messageId,
        deltaSeq: inner.delta_seq,
        deltaText,
      };
    }

    case "artifact.persisted":
    case "task.artifact_ready":
    case "artifact_ready": {
      const mapped = mapPublicArtifactDescriptor(inner);
      return {
        eventId,
        eventSeq,
        artifacts: mapped ? [mapped] : undefined,
      };
    }

    case "run.failed":
    case "run_failed":
    case "task.failed":
    case "failed":
      return {
        eventId,
        eventSeq,
        phase: "failed",
        displayStage: "Skill execution failed",
        errorCode:
          typeof inner.error_code === "string"
            ? inner.error_code
            : typeof payload.error_code === "string"
              ? payload.error_code
              : "RUN_FAILED",
        errorMessage:
          typeof inner.error_message === "string"
            ? inner.error_message
            : typeof inner.message === "string"
              ? inner.message
              : typeof payload.error_message === "string"
                ? payload.error_message
                : typeof payload.message === "string"
                  ? payload.message
                  : "Skill run failed",
      };

    case "run.cancelled":
    case "run_cancelled":
    case "task.cancelled":
    case "cancelled":
    case "canceled":
      return {
        eventId,
        eventSeq,
        phase: "cancelled",
        displayStage: "Skill execution cancelled",
      };

    case "run.timed_out":
    case "task.timed_out":
      return {
        eventId,
        eventSeq,
        phase: "expired",
        displayStage: "Skill execution failed",
      };

    case "reasoning.summary": {
      const summary = clipDisplayString(inner.summary);
      if (!summary) {
        return unknownEvent(eventId, eventSeq);
      }
      return {
        eventId,
        eventSeq,
        activity: { kind: "reasoning.summary", summary },
      };
    }

    case "tool.call": {
      const toolName = clipDisplayString(inner.tool_name);
      const callId = clipDisplayString(inner.call_id);
      if (!toolName || !callId || !isToolCallStatus(inner.status)) {
        return unknownEvent(eventId, eventSeq);
      }
      return {
        eventId,
        eventSeq,
        activity: {
          kind: "tool.call",
          toolName,
          callId,
          status: inner.status,
        },
      };
    }

    case "clarify.requested": {
      const question = clipDisplayString(inner.question);
      if (!question) {
        return unknownEvent(eventId, eventSeq);
      }
      const options = sanitizeClarifyOptions(inner.options);
      return {
        eventId,
        eventSeq,
        activity: {
          kind: "clarify.requested",
          question,
          ...(options.length > 0 ? { options } : {}),
        },
      };
    }

    case "approval.requested": {
      const approvalId = clipDisplayString(inner.approval_id);
      const summary = clipDisplayString(inner.summary);
      if (!approvalId || !summary) {
        return unknownEvent(eventId, eventSeq);
      }
      return {
        eventId,
        eventSeq,
        phase: "waiting-approval",
        displayStage: "Waiting for approval...",
        activity: {
          kind: "approval.requested",
          approvalId,
          summary,
        },
      };
    }

    default:
      return unknownEvent(eventId, eventSeq);
  }
}
