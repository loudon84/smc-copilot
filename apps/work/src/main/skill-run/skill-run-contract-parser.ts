/**
 * Skill Run Event & Snapshot Parser.
 * Maps wire events and run status to Work-safe projection updates.
 * Fails soft on unknown event types without corrupting terminal states.
 */

import type {
  SkillCatalogToolItem,
  SkillRunArtifactDescriptor,
  SkillRunLocalPhase,
} from "../../shared/skill-run";

export type BindPromptFirstErrorCode =
  | "TOOL_NOT_FOUND"
  | "TOOL_NOT_CALLABLE"
  | "PARAMETERS_REQUIRED"
  | "UNSUPPORTED_SCHEMA";

export type BindPromptFirstResult =
  | { ok: true; tool: SkillCatalogToolItem }
  | { ok: false; errorCode: BindPromptFirstErrorCode; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function schemaHasUnsupportedShape(schema: Record<string, unknown>): boolean {
  if (typeof schema.$ref === "string" && schema.$ref.trim()) {
    return true;
  }
  if (schema.type === "array") {
    return true;
  }
  if (schema.oneOf || schema.anyOf || schema.allOf) {
    return true;
  }
  const props = schema.properties;
  if (!isRecord(props)) {
    return false;
  }
  for (const [key, raw] of Object.entries(props)) {
    if (key === "prompt") continue;
    if (!isRecord(raw)) return true;
    if (raw.$ref || raw.type === "object" || raw.type === "array") {
      return true;
    }
  }
  return false;
}

/** Main-side Catalog revalidation: prompt-first tools only; fail-closed on complex schema. */
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
  if (tool.callability !== "callable") {
    return {
      ok: false,
      errorCode: "TOOL_NOT_CALLABLE",
      message: `Skill tool is not callable: ${trimmedName}`,
    };
  }

  const schema = tool.inputSchema;
  if (schema && schemaHasUnsupportedShape(schema)) {
    return {
      ok: false,
      errorCode: "UNSUPPORTED_SCHEMA",
      message: "Skill tool schema is not prompt-first compatible",
    };
  }

  const required = Array.isArray(schema?.required)
    ? schema.required.filter((field): field is string => typeof field === "string")
    : [];
  const extraRequired = required.filter((field) => field !== "prompt");
  if (extraRequired.length > 0) {
    return {
      ok: false,
      errorCode: "PARAMETERS_REQUIRED",
      message: `Additional required parameters are not supported: ${extraRequired.join(", ")}`,
    };
  }

  if (!trimmedPrompt) {
    return {
      ok: false,
      errorCode: "PARAMETERS_REQUIRED",
      message: "Prompt is required for this skill",
    };
  }

  return { ok: true, tool };
}

export function mapPublicSkillCatalogTools(rawTools: unknown): SkillCatalogToolItem[] {
  if (!Array.isArray(rawTools)) return [];
  const out: SkillCatalogToolItem[] = [];
  for (const raw of rawTools) {
    if (!isRecord(raw) || typeof raw.name !== "string" || !raw.name.trim()) {
      continue;
    }
    if (raw.capabilityKind !== "skill") {
      continue;
    }
    const toolName = raw.name.trim();
    const title =
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title.trim()
        : toolName;
    const interactionMode = raw.interactionMode;
    const callability: SkillCatalogToolItem["callability"] =
      interactionMode === "form" ? "unsupported" : "callable";
    out.push({
      toolName,
      title,
      description: typeof raw.description === "string" ? raw.description : undefined,
      category: typeof raw.category === "string" ? raw.category : undefined,
      callability,
      inputSchema: isRecord(raw.inputSchema) ? raw.inputSchema : undefined,
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
