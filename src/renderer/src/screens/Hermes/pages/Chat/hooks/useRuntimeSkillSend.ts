import { useCallback } from "react";
import { workExpertGatewayApi } from "../../../api/workExpertGatewayApi";
import type { WorkChatContext } from "../../../types/work-chat";

type LocalMessage = { role: "user" | "assistant"; content: string };

type StreamHelpers = {
  appendLocalMessage: (message: LocalMessage) => void;
  setExternalRunState: (
    state: "creating" | "streaming" | "completed" | "error" | "idle" | "cancelled",
  ) => void;
  setLastError: (error: string | null) => void;
};

type TaskStreamHelpers = {
  startStream: (input: {
    taskId: string;
    taskNo?: string;
    eventSseUrl: string;
    artifactUrl?: string;
    expertName?: string;
    skillName?: string;
    runId?: string;
  }) => Promise<void>;
};

export function useRuntimeSkillSend(
  workContext: WorkChatContext,
  stream: StreamHelpers,
  taskStream: TaskStreamHelpers,
) {
  const sendToRuntimeSkill = useCallback(
    async (input: {
      text: string;
      attachmentIds: string[];
      sessionId?: string | null;
      onComposerClear?: () => void;
    }) => {
      const skill = workContext.selectedSkill;
      const expert = workContext.selectedExpert;
      if (!skill || !expert) return;

      const prompt = input.text.trim();
      if (!prompt && input.attachmentIds.length === 0) return;

      stream.appendLocalMessage({
        role: "user",
        content: prompt || "(attachments)",
      });

      stream.setExternalRunState("creating");
      stream.setLastError(null);

      const result = await workExpertGatewayApi.callExpertSkill({
        expertSlug: expert.slug,
        skillName: skill.name,
        prompt,
        permissionMode: workContext.permissionMode,
        attachmentIds: input.attachmentIds,
        sessionId: input.sessionId,
      });

      if (result.ok && result.mode === "event_stream" && result.taskId && result.eventSseUrl) {
        stream.appendLocalMessage({
          role: "assistant",
          content:
            `**Expert task accepted**\n\n` +
            `- Task: ${result.taskNo ?? result.taskId}\n` +
            `- Status: ${result.status ?? "accepted"}\n`,
        });

        await taskStream.startStream({
          taskId: result.taskId,
          taskNo: result.taskNo,
          eventSseUrl: result.eventSseUrl,
          artifactUrl: result.artifactUrl,
          expertName: expert.name,
          skillName: skill.displayName,
          runId: result.runId,
        });

        stream.setExternalRunState("streaming");
        input.onComposerClear?.();
        return;
      }

      if (result.ok && result.mode === "sync_result" && result.responseText) {
        stream.appendLocalMessage({
          role: "assistant",
          content: result.responseText,
        });
        stream.setExternalRunState("completed");
        input.onComposerClear?.();
        return;
      }

      const error = !result.ok ? (result.error ?? "Expert Gateway call failed") : "Expert Gateway call failed";
      stream.appendLocalMessage({
        role: "assistant",
        content: `**Expert Gateway error**\n\n${error}`,
      });
      stream.setLastError(error);
      stream.setExternalRunState("error");
      input.onComposerClear?.();
    },
    [workContext, stream, taskStream],
  );

  return { sendToRuntimeSkill };
}
