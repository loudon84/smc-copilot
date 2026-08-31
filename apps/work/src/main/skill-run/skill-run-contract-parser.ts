/**
 * Skill Run Event & Snapshot Parser.
 * Maps wire events and run status to Work-safe projection updates.
 * Fails soft on unknown event types without corrupting terminal states.
 */

import type {
  SkillRunArtifactDescriptor,
  SkillRunLocalPhase,
} from "../../shared/skill-run";

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
