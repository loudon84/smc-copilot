import { useEffect, useMemo, useRef, useState } from "react";
import { useHermesWorkspace } from "../../../context/HermesWorkspaceContext";
import type { UseWorkChatContextReturn } from "../../../types/work-chat";
import type { ChatTaskStatus, ToolProgressEntry } from "../types/chat-task-window";
import { extractLocalDocumentPaths, type LocalDocumentRef } from "../utils/extractLocalDocumentPaths";
import { useHermesDefaultWebChat } from "./useHermesDefaultWebChat";

type Options = {
  forcedSessionId?: string | null;
  workContext?: UseWorkChatContextReturn;
};

function truncateTitle(text: string, max = 48): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function deriveTaskStatus(input: {
  runState: ReturnType<typeof useHermesDefaultWebChat>["stream"]["runState"];
  messageCount: number;
  composerText: string;
  activeTool: ReturnType<typeof useHermesDefaultWebChat>["stream"]["activeTool"];
}): ChatTaskStatus {
  const { runState, messageCount, composerText, activeTool } = input;

  if (runState === "creating") return "creating";
  if (runState === "streaming") {
    if (activeTool) return "waiting_tool";
    return "running";
  }
  if (runState === "waiting_approval") return "waiting_approval";
  if (runState === "completed") return "completed";
  if (runState === "error") return "failed";
  if (runState === "cancelled") return "cancelled";

  if (messageCount === 0 && !composerText.trim()) return "draft";
  if (composerText.trim()) return "ready";
  return messageCount > 0 ? "ready" : "draft";
}

function mergeToolProgressEntries(entries: ToolProgressEntry[]): ToolProgressEntry[] {
  const merged: ToolProgressEntry[] = [];
  for (const entry of entries) {
    const last = merged[merged.length - 1];
    if (last && last.name === entry.name && last.status === entry.status && entry.status === "running") {
      merged[merged.length - 1] = {
        ...last,
        message: entry.message ?? entry.resultPreview ?? last.message,
        title: entry.title ?? last.title ?? entry.name,
      };
      continue;
    }
    merged.push({
      ...entry,
      title: entry.title ?? entry.name,
    });
  }
  return merged;
}

export function useChatTaskWindow(options?: Options) {
  const workspace = useHermesWorkspace();
  const chat = useHermesDefaultWebChat(
    options?.forcedSessionId !== undefined ? { forcedSessionId: options.forcedSessionId } : undefined,
  );

  const { composer, stream } = chat;
  const workContext = options?.workContext;

  const taskStatus = useMemo(
    () =>
      deriveTaskStatus({
        runState: stream.runState,
        messageCount: stream.messages.length,
        composerText: composer.text,
        activeTool: stream.activeTool,
      }),
    [composer.text, stream.activeTool, stream.messages.length, stream.runState],
  );

  const taskTitle = useMemo(() => {
    const firstUser = stream.messages.find((m) => m.role === "user");
    if (firstUser?.content.trim()) return truncateTitle(firstUser.content);
    if (composer.text.trim()) return truncateTitle(composer.text);
    return "新任务";
  }, [composer.text, stream.messages]);

  const toolProgressTimeline = useMemo(
    () => mergeToolProgressEntries(stream.toolProgressTimeline),
    [stream.toolProgressTimeline],
  );

  const timelineCollapsed = useMemo(
    () =>
      stream.runState === "completed" ||
      stream.runState === "idle" ||
      (stream.runState === "error" && !stream.streamingContent),
    [stream.runState, stream.streamingContent],
  );

  const documentOutputs = useMemo(() => {
    const seen = new Set<string>();
    const results: LocalDocumentRef[] = [];

    const addFromContent = (content: string) => {
      for (const doc of extractLocalDocumentPaths(content)) {
        if (seen.has(doc.path)) continue;
        seen.add(doc.path);
        results.push(doc);
      }
    };

    for (const msg of stream.messages) {
      if (msg.role === "assistant" || msg.role === "system" || msg.role === "tool") {
        addFromContent(msg.content);
      }
    }
    if (stream.streamingContent) {
      addFromContent(stream.streamingContent);
    }
    return results;
  }, [stream.messages, stream.streamingContent]);

  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const prevRunStateRef = useRef(stream.runState);

  useEffect(() => {
    const prev = prevRunStateRef.current;
    prevRunStateRef.current = stream.runState;

    if (stream.runState === "creating" && prev !== "creating") {
      setRunStartedAt(Date.now());
      setDurationMs(0);
    }
    if (
      (stream.runState === "completed" ||
        stream.runState === "error" ||
        stream.runState === "cancelled" ||
        stream.runState === "idle") &&
      prev !== stream.runState &&
      runStartedAt != null
    ) {
      setDurationMs(Date.now() - runStartedAt);
    }
  }, [runStartedAt, stream.runState]);

  useEffect(() => {
    const active =
      stream.runState === "creating" ||
      stream.runState === "streaming" ||
      stream.runState === "waiting_approval";
    if (!active || runStartedAt == null) return;

    const id = window.setInterval(() => {
      setDurationMs(Date.now() - runStartedAt);
    }, 1000);
    return () => window.clearInterval(id);
  }, [runStartedAt, stream.runState]);

  return {
    ...chat,
    task: {
      status: taskStatus,
      title: taskTitle,
      expertName: workContext?.selectedExpert?.name,
      skillName: workContext?.selectedSkill?.displayName ?? workContext?.selectedSkill?.name,
      profileId: workspace.activeProfileId,
      durationMs,
    },
    toolProgressTimeline,
    timelineCollapsed,
    documentOutputs,
  };
}

export type UseChatTaskWindowReturn = ReturnType<typeof useChatTaskWindow>;
