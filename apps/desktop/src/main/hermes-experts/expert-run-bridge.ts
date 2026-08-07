import type { HermesChatSendPayload } from "../../shared/hermes-default-chat/hermes-default-chat-contract";
import { HermesExpertsError } from "../../shared/hermes-experts/hermes-experts-errors";
import { createTextArtifact } from "./expert-artifacts";
import { assertChatSendAllowed, assertToolProgressAllowed } from "./expert-policy";
import { reportExpertRunIfConfigured } from "./expert-desktop-client";
import { emitExpertRuntimeEvent } from "./expert-run-events";
import {
  getExpertRun,
  insertRunEvent,
  listRunEvents,
  updateExpertRunStatus,
} from "./expert-runtime-db";
import { dispatchTeamRun } from "./expert-team-runtime";

export type ChatBridgeBlock = {
  blocked: true;
  errorCode: string;
  message: string;
};

export async function beforeExpertChatSend(
  payload: HermesChatSendPayload,
): Promise<ChatBridgeBlock | null> {
  if (payload.expert_id) {
    try {
      assertChatSendAllowed(payload.expert_id);
    } catch (err) {
      if (err instanceof HermesExpertsError) {
        return { blocked: true, errorCode: err.code, message: err.message };
      }
      throw err;
    }
  }

  const runId = payload.expert_run_id;
  if (!runId) return null;

  const run = getExpertRun(runId);
  if (run?.activeProfileId === "remote" || run?.remoteTaskId) {
    return null;
  }

  const priorEvents = listRunEvents(runId);
  const isFirstMessage = !priorEvents.some((e) => e.eventType === "message_sent");

  if (payload.team_id && isFirstMessage && payload.message.trim() && run) {
    if (run.status === "running" || run.status === "dispatching") {
      await dispatchTeamRun({
        runId,
        teamId: payload.team_id,
        leaderProfileId: payload.profile ?? run.activeProfileId,
        userPrompt: payload.message,
      });
    }
  }

  insertRunEvent({
    runId,
    eventType: "message_sent",
    sourceProfileId: payload.profile,
    payload: {
      expertId: payload.expert_id,
      teamId: payload.team_id,
      preview: payload.message.slice(0, 500),
      workMode: payload.work_mode,
    },
  });
  emitExpertRuntimeEvent({
    type: "run_event",
    runId,
    payload: { eventType: "message_sent" },
  });

  return null;
}

export function bridgeChatToolProgress(input: {
  runId?: string;
  profile?: string;
  expertId?: string;
  toolLabel: string;
}): void {
  if (!input.runId) return;

  if (input.expertId) {
    try {
      assertToolProgressAllowed(input.expertId, input.toolLabel);
    } catch (err) {
      if (err instanceof HermesExpertsError && err.code === "EXPERT_TRUST_REQUIRED") {
        updateExpertRunStatus(input.runId, "waiting_approval", {
          errorCode: err.code,
          errorMessage: err.message,
        });
        emitExpertRuntimeEvent({
          type: "run_updated",
          runId: input.runId,
          payload: { status: "waiting_approval", tool: input.toolLabel },
        });
        return;
      }
    }
  }

  insertRunEvent({
    runId: input.runId,
    eventType: "tool_call",
    sourceProfileId: input.profile,
    payload: { tool: input.toolLabel },
  });
  emitExpertRuntimeEvent({
    type: "run_event",
    runId: input.runId,
    payload: { eventType: "tool_call", tool: input.toolLabel },
  });
}

export async function afterExpertChatComplete(input: {
  runId?: string;
  profile?: string;
  response: string;
  sessionId?: string;
  error?: string;
}): Promise<void> {
  if (!input.runId) return;

  if (input.error) {
    updateExpertRunStatus(input.runId, "failed", {
      errorMessage: input.error,
      errorCode: "CHAT_FAILED",
    });
    insertRunEvent({
      runId: input.runId,
      eventType: "message_failed",
      sourceProfileId: input.profile,
      payload: { error: input.error },
    });
    emitExpertRuntimeEvent({
      type: "run_updated",
      runId: input.runId,
      payload: { status: "failed" },
    });
    void reportExpertRunIfConfigured(input.runId);
    return;
  }

  insertRunEvent({
    runId: input.runId,
    eventType: "message_completed",
    sourceProfileId: input.profile,
    payload: { sessionId: input.sessionId },
  });

  if (input.response.trim()) {
    createTextArtifact({
      runId: input.runId,
      profileId: input.profile,
      title: "Agent response",
      artifactType: "markdown",
      previewText: input.response.slice(0, 4000),
      source: "agent_response",
    });
    emitExpertRuntimeEvent({
      type: "artifact_created",
      runId: input.runId,
      payload: { source: "agent_response" },
    });
  }

  const run = getExpertRun(input.runId);
  if (run?.runType === "single_expert" && run.status === "running") {
    updateExpertRunStatus(input.runId, "completed", {
      resultSummary: input.response.slice(0, 500),
    });
  }

  emitExpertRuntimeEvent({
    type: "run_updated",
    runId: input.runId,
    payload: { status: run?.runType === "team" ? run.status : "completed" },
  });
  void reportExpertRunIfConfigured(input.runId);
}
