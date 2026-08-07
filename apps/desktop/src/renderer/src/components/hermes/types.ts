export type HermesPanelRunState = "idle" | "creating" | "streaming" | "error" | "cancelled";

export type HermesPanelMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
};

export type HermesPanelToolCall = {
  tid: string;
  name: string;
  preview: string;
  done: boolean;
};

export type HermesPanelPageContextPayload = {
  url: string;
  title: string;
  frameId: string | null;
  frameMeta?: {
    name?: string | null;
    origin?: string | null;
    /** Serialized frame path indices */
    path?: string | null;
    url?: string | null;
  };
  htmlExcerpt?: string;
  textExcerpt?: string;
  truncated?: boolean;
  capturedAt?: string;
  interactiveElementCount?: number;
};

/** Page context passed into the runtime panel (e.g. from WebOperator). */
export type HermesPanelPageContext = {
  type: "web-operator";
  scopeKey: string;
  summary: string;
  payload: HermesPanelPageContextPayload;
};

export type HermesPanelPresetAction = {
  label: string;
  prompt: string;
};

export type HermesPanelTaskAction = "loading" | "running" | "pending";

export type HermesPanelTaskInput = {
  taskId: string;
  source: string;
  requestId: string;
  pageUrl: string;
  sessionId: string | null;
  pageContext: HermesPanelPageContext;
  action: HermesPanelTaskAction;
  userPrompt?: string;
  skill?: string;
  /** Dialog 选了「新建会话」— store/chat 不得复用旧 binding 或共享 draft。 */
  createNewSession?: boolean;
  hostBridge?: {
    requestId: string;
    formType: string;
    action: "create" | "edit" | "view" | "analytic";
    callbackUrl?: string;
    skillName: string;
  };
};

export type HermesPanelTaskSessionReadyInput = {
  taskId: string;
  source: string;
  requestId: string;
  pageUrl: string;
  sessionId: string;
  pageContext: HermesPanelPageContext;
  skill: string;
};
