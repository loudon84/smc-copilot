/** v5.7.5 — WebOperator task ↔ Hermes session binding (Desktop SQLite, not Hermes state.db). */

export type WebOperatorTaskSessionStatus = "active" | "archived";

/** JSON-safe page context stored in task_session (mirrors HermesPanelPageContext). */
export type WebOperatorTaskPageContextPayload = {
  url: string;
  title: string;
  frameId: string | null;
  frameMeta?: {
    name?: string | null;
    origin?: string | null;
    path?: string | null;
    url?: string | null;
  };
  htmlExcerpt?: string;
  textExcerpt?: string;
  truncated?: boolean;
  capturedAt?: string;
  interactiveElementCount?: number;
};

export type WebOperatorTaskPageContext = {
  type: "web-operator";
  scopeKey: string;
  summary: string;
  payload: WebOperatorTaskPageContextPayload;
};

export type WebOperatorTaskSessionIdentity = {
  source: string;
  requestId: string;
};

export type WebOperatorTaskSessionRecord = {
  taskId: string;
  source: string;
  requestId: string;
  pageUrl: string;
  sessionId: string;
  pageContext: WebOperatorTaskPageContext;
  skill: string;
  status: WebOperatorTaskSessionStatus;
  createdAt: string;
  updatedAt: string;
};

export type WebOperatorTaskSessionLookupResult = {
  taskId: string;
  source: string;
  requestId: string;
  pageUrl?: string;
  record: WebOperatorTaskSessionRecord | null;
};

export type WebOperatorTaskSessionResolveInput = {
  source: string;
  requestId: string;
  pageUrl?: string;
};

export type WebOperatorTaskSessionUpsertInput = {
  source: string;
  requestId: string;
  pageUrl: string;
  sessionId: string;
  pageContext: WebOperatorTaskPageContext;
  skill?: string;
  /** User chose「新建会话」— drop prior binding for this source+requestId before insert. */
  createNewSession?: boolean;
};

export type WebOperatorTaskSessionPrepareNewInput = {
  source: string;
  requestId: string;
};

export type WebOperatorTaskSessionGetLastActiveResult = {
  record: WebOperatorTaskSessionRecord | null;
};

export interface WebOperatorTaskSessionAPI {
  resolve(input: WebOperatorTaskSessionResolveInput): Promise<WebOperatorTaskSessionLookupResult>;
  upsert(input: WebOperatorTaskSessionUpsertInput): Promise<WebOperatorTaskSessionRecord>;
  prepareNewSession(input: WebOperatorTaskSessionPrepareNewInput): Promise<{ ok: true }>;
  remove(taskId: string): Promise<{ ok: true }>;
  getLastActive(): Promise<WebOperatorTaskSessionGetLastActiveResult>;
}
