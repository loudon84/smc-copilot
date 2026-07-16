import type { HermesToolCall } from "../../../types";

export type ChatTaskStatus =
  | "draft"
  | "ready"
  | "creating"
  | "running"
  | "waiting_tool"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type ToolProgressEntry = HermesToolCall & {
  startedAt: string;
  completedAt?: string;
  taskId?: string;
  title?: string;
  message?: string;
};

export type ChatTaskEvent =
  | { type: "task.status"; status: ChatTaskStatus }
  | { type: "chat.chunk"; content: string }
  | { type: "tool.progress"; entry: ToolProgressEntry }
  | { type: "output.document"; path: string }
  | { type: "usage"; usage: unknown }
  | { type: "error"; error: string }
  | { type: "done"; sessionId?: string };

export type ChatTaskWindowMeta = {
  status: ChatTaskStatus;
  title: string;
  expertName?: string;
  skillName?: string;
  profileId: string;
  durationMs: number;
};
