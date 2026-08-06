import { useCallback, useEffect, useState } from "react";
import type { ChatFilesChangedEvent } from "@shared/chat-files/chat-files-events";

export type SessionFilesSummary = {
  total: number;
  attachments: number;
  context: number;
  agentOutput: number;
  loading: boolean;
  version: number;
};

const EMPTY: SessionFilesSummary = {
  total: 0,
  attachments: 0,
  context: 0,
  agentOutput: 0,
  loading: false,
  version: 0,
};

/**
 * Live Session Files badge counts — refreshes on chat-files:changed.
 */
export function useSessionFilesSummary(input: {
  sessionId: string | null | undefined;
  profileId: string;
}): SessionFilesSummary {
  const { sessionId, profileId } = input;
  const [summary, setSummary] = useState<SessionFilesSummary>(EMPTY);

  const refresh = useCallback(async () => {
    const sid = sessionId?.trim();
    if (!sid || !window.chatFiles?.listSessionFiles) {
      setSummary(EMPTY);
      return;
    }
    setSummary((prev) => ({ ...prev, loading: true }));
    try {
      const files = await window.chatFiles.listSessionFiles(profileId, sid);
      let attachments = 0;
      let context = 0;
      let agentOutput = 0;
      for (const f of files) {
        if (f.category === "context") context += 1;
        else if (f.category === "agent_output") agentOutput += 1;
        else attachments += 1;
      }
      setSummary((prev) => ({
        total: files.length,
        attachments,
        context,
        agentOutput,
        loading: false,
        version: prev.version + 1,
      }));
    } catch {
      setSummary((prev) => ({ ...prev, loading: false }));
    }
  }, [sessionId, profileId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sid = sessionId?.trim();
    if (!sid || !window.chatFiles?.onChanged) return;
    return window.chatFiles.onChanged((event: ChatFilesChangedEvent) => {
      const profile = profileId?.trim() || "default";
      if (event.sessionId !== sid) return;
      if (event.profileId && event.profileId !== profile) return;
      void refresh();
    });
  }, [sessionId, profileId, refresh]);

  return summary;
}
