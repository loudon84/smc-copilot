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

export type ParseSkillCatalogResult =
  | { status: "ready"; tools: SkillCatalogToolItem[] }
  | { status: "contract-unsupported"; tools: []; reason: string };

function catalogCallability(
  interactionMode: unknown,
): SkillCatalogToolItem["callability"] {
  if (interactionMode === "form") return "unsupported";
  if (interactionMode === "chat" || interactionMode == null) return "callable";
  return "disabled";
}

/**
 * Main-side Catalog sanitizer. Missing capabilityKind is fail-closed
 * (contract-unsupported), not a guessed Skill/Connector filter.
 */
export function parseSkillCatalogTools(rawTools: unknown): ParseSkillCatalogResult {
  if (!Array.isArray(rawTools)) {
    return {
      status: "contract-unsupported",
      tools: [],
      reason: "Catalog tools array is missing from the provider response.",
    };
  }
  if (rawTools.length === 0) {
    return { status: "ready", tools: [] };
  }

  const missingDiscriminator = rawTools.some((item) => {
    if (!isRecord(item)) return true;
    return item.capabilityKind !== "skill" && item.capabilityKind !== "connector";
  });
  if (missingDiscriminator) {
    return {
      status: "contract-unsupported",
      tools: [],
      reason:
        "Catalog items lack a stable Skill discriminator (capabilityKind).",
    };
  }

  const tools: SkillCatalogToolItem[] = [];
  for (const item of rawTools) {
    if (!isRecord(item) || item.capabilityKind !== "skill") continue;
    const toolName =
      typeof item.name === "string"
        ? item.name.trim()
        : typeof item.toolName === "string"
          ? item.toolName.trim()
          : "";
    if (!toolName) continue;
    const title =
      typeof item.title === "string" && item.title.trim()
        ? item.title.trim()
        : toolName;
    const description =
      typeof item.description === "string" ? item.description : undefined;
    const category =
      typeof item.category === "string"
        ? item.category
        : isRecord(item.annotations) && typeof item.annotations.category === "string"
          ? item.annotations.category
          : undefined;
    const inputSchema = isRecord(item.inputSchema) ? item.inputSchema : undefined;
    tools.push({
      toolName,
      title,
      description,
      category,
      callability: catalogCallability(item.interactionMode),
      inputSchema,
    });
  }
  return { status: "ready", tools };
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
  const eventId = typeof payload.id === "string" ? payload.id : undefined;
  const eventSeq = typeof payload.seq === "number" ? payload.seq : undefined;

  switch (eventType) {
    case "run.started":
    case "run_started":
      return {
        eventId,
        eventSeq,
        phase: "running",
        displayStage: "Executing skill...",
      };

    case "run.waiting_approval":
    case "run_waiting_approval":
      return {
        eventId,
        eventSeq,
        phase: "waiting-approval",
        displayStage: "Waiting for approval...",
      };

    case "run.succeeded":
    case "run_completed": {
      const artifactsRaw = payload.artifacts;
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
        typeof payload.result_text === "string"
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

    case "run.failed":
    case "run_failed":
      return {
        eventId,
        eventSeq,
        phase: "failed",
        displayStage: "Skill execution failed",
        errorCode:
          typeof payload.error_code === "string"
            ? payload.error_code
            : "RUN_FAILED",
        errorMessage:
          typeof payload.error_message === "string"
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

    default:
      // Unknown event type: fail-soft, advance cursor only
      return {
        eventId,
        eventSeq,
        rawUnknown: true,
      };
  }
}
