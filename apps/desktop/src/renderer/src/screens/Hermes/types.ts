export type HermesGatewayUiStatus =
  | "running"
  | "stopped"
  | "starting"
  | "stopping"
  | "error";

export type HermesChatRunState =
  | "idle"
  | "creating"
  | "streaming"
  | "waiting_approval"
  | "completed"
  | "error"
  | "cancelled";

export type HermesRightInspectorTab =
  | "runtime"
  | "skills"
  | "memory"
  | "workspace"
  | "timeline"
  | "artifacts"
  | "members"
  | "audit"
  | "toolsMcp";

export type HermesMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: string;
  toolCalls?: HermesToolCall[];
};

export type HermesToolCall = {
  id: string;
  name: string;
  args?: unknown;
  resultPreview?: string;
  status: "running" | "completed" | "error" | "waiting_approval";
};

export type HermesSession = {
  id: string;
  title: string;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
};

export type HermesDefaultRuntimeHandle = {
  status: HermesGatewayUiStatus;
  busy: boolean;
  error: string | null;
  hermesHome: string | null;
  modelConfig: { provider: string; model: string; baseUrl: string } | null;
  version: string | null;
  refresh: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  readLogs: (lines?: number) => Promise<string>;
};
