import { useCallback } from "react";
import type { ChatRuntimePort } from "../ports/ChatRuntimePort";
import type { ChatNavigationPort } from "../ports/ChatNavigationPort";
import type { ChatSubmitInput } from "@shared/chat-runtime/chat-runtime-contract";

export type UseChatActionsArgs = {
  runtime: ChatRuntimePort;
  navigation?: ChatNavigationPort;
  runId: string;
  profileId: string;
  sessionId?: string;
  expertId?: string;
  teamId?: string;
  expertRunId?: string;
  workMode?: string;
  invocationSource?: ChatSubmitInput["invocationSource"];
};

export function useChatActions({
  runtime,
  navigation,
  runId,
  profileId,
  sessionId,
  expertId,
  teamId,
  expertRunId,
  workMode,
  invocationSource = "default_chat",
}: UseChatActionsArgs): {
  submit: (message: string, history?: ChatSubmitInput["history"]) => Promise<void>;
  abort: () => Promise<void>;
  openWeb: (url: string) => void;
} {
  const submit = useCallback(
    async (message: string, history: ChatSubmitInput["history"] = []) => {
      await runtime.submit({
        runId,
        turnId: `turn-${Date.now()}`,
        profileId,
        sessionId,
        message,
        history,
        expertId,
        teamId,
        expertRunId,
        workMode,
        invocationSource,
      });
    },
    [
      runtime,
      runId,
      profileId,
      sessionId,
      expertId,
      teamId,
      expertRunId,
      workMode,
      invocationSource,
    ],
  );

  const abort = useCallback(async () => {
    await runtime.abort(runId);
  }, [runtime, runId]);

  const openWeb = useCallback(
    (url: string) => {
      void navigation?.openWeb(url);
    },
    [navigation],
  );

  return { submit, abort, openWeb };
}
