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
  SkillRunLocalPhase,
} from "../../shared/skill-run";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

/**
 * Single invocation classification owner for Catalog projection and Main start.
 * Optional complex properties do not disqualify prompt-first (PRD 5.4 / AC-04).
 */
export function classifySkillInvocation(
  tool: Pick<
    NormalizedSkillToolDescriptor,
    "interactionMode" | "promptField" | "inputSchema"
  >,
): SkillInvocationClassification {
  if (tool.interactionMode === "form") {
    return classifyUnsupported("FORM_REQUIRED", "form-required");
  }

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
  if (!isRecord(promptProp) || promptProp.type !== "string") {
    return classifyUnsupported("PROMPT_FIELD_INVALID");
  }

  const required = Array.isArray(schema?.required)
    ? schema.required.filter((field): field is string => typeof field === "string")
    : [];
  const extraRequired = required.filter((field) => field !== promptField);
  if (extraRequired.length > 0) {
    return {
      invocationMode: "parameters-required",
      callability: "unsupported",
      reasonCode: "EXTRA_REQUIRED_PARAMETERS",
      promptField,
    };
  }

  return {
    invocationMode: "prompt-first",
    callability: "callable",
    promptField,
  };
}

/** Main-side Catalog revalidation: prompt-first tools only; fail-closed on non-bindable schemas. */
export function bindPromptFirstTool(
  toolName: string,
  prompt: string,
  catalog: SkillCatalogToolItem[],
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
  if (classification.invocationMode !== "prompt-first") {
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

  return {
    ok: true,
    tool,
    promptField,
    arguments: { [promptField]: trimmedPrompt },
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
      inputSchema: normalized.inputSchema,
    });
  }
  return out;
}

export interface ParsedSkillRunEvent {
  eventId?: string;
  eventSeq?: number;
  phase?: SkillRunLocalPhase;
  displayStage?: string;
  text?: string;
  errorCode?: string;
  errorMessage?: string;
  artifacts?: SkillRunArtifactDescriptor[];
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
  const wireType =
    typeof payload.event_type === "string" ? payload.event_type : eventType;

  switch (wireType) {
    case "run.created":
    case "run.progress":
    case "run.started":
    case "run_started":
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
    case "run_completed": {
      const artifactsRaw = inner.artifacts ?? payload.artifacts;
      const artifacts: SkillRunArtifactDescriptor[] = [];
      if (Array.isArray(artifactsRaw)) {
        for (const item of artifactsRaw) {
          if (
            item &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>).id === "string" &&
            typeof (item as Record<string, unknown>).file_name === "string"
          ) {
            artifacts.push(item as SkillRunArtifactDescriptor);
          }
        }
      }
      const text =
        typeof inner.text === "string"
          ? inner.text
          : typeof inner.result_text === "string"
            ? inner.result_text
            : typeof inner.message === "string"
              ? inner.message
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

    case "assistant.message":
      return {
        eventId,
        eventSeq,
        phase: "running",
        text: typeof inner.text === "string" ? inner.text : undefined,
      };

    case "artifact.persisted": {
      const artifactId = typeof inner.id === "string" ? inner.id : undefined;
      const fileName =
        typeof inner.file_name === "string" ? inner.file_name : undefined;
      return {
        eventId,
        eventSeq,
        artifacts:
          artifactId && fileName
            ? [{ id: artifactId, file_name: fileName }]
            : undefined,
      };
    }

    case "run.failed":
    case "run_failed":
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
      return {
        eventId,
        eventSeq,
        phase: "cancelled",
        displayStage: "Skill execution cancelled",
      };

    case "run.timed_out":
      return {
        eventId,
        eventSeq,
        phase: "expired",
        displayStage: "Skill execution failed",
      };

    default:
      return {
        eventId,
        eventSeq,
        rawUnknown: true,
      };
  }
}
