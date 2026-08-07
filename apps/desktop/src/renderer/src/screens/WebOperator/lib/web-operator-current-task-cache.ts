import type { HermesPanelPageContext, HermesPanelTaskInput } from "../../../components/hermes";
import type { WebOperatorTaskSessionRecord } from "../../../../../shared/web-operator/web-operator-task-session-contract";

const STORAGE_KEY = "weboperator-current-task-v2";

export type WebOperatorCurrentTaskSnapshot = {
  taskId: string;
  source: string;
  requestId: string;
  pageUrl: string;
  sessionId: string | null;
  pageContext: HermesPanelPageContext;
  skill?: string;
  hostBridge?: HermesPanelTaskInput["hostBridge"];
};

function isPageContext(value: unknown): value is HermesPanelPageContext {
  if (!value || typeof value !== "object") return false;
  const ctx = value as HermesPanelPageContext;
  return ctx.type === "web-operator" && typeof ctx.scopeKey === "string";
}

export function recordToTaskInput(record: WebOperatorTaskSessionRecord): HermesPanelTaskInput {
  return {
    taskId: record.taskId,
    source: record.source,
    requestId: record.requestId,
    pageUrl: record.pageUrl,
    sessionId: record.sessionId,
    pageContext: record.pageContext as HermesPanelPageContext,
    action: "loading",
    skill: record.skill,
  };
}

export function snapshotFromTaskInput(task: HermesPanelTaskInput): WebOperatorCurrentTaskSnapshot | null {
  if (task.action === "running" && !task.sessionId) {
    return null;
  }
  return {
    taskId: task.taskId,
    source: task.source,
    requestId: task.requestId,
    pageUrl: task.pageUrl,
    sessionId: task.sessionId,
    pageContext: task.pageContext,
    skill: task.skill,
    hostBridge: task.hostBridge,
  };
}

export function taskInputFromSnapshot(snapshot: WebOperatorCurrentTaskSnapshot): HermesPanelTaskInput {
  return {
    taskId: snapshot.taskId,
    source: snapshot.source,
    requestId: snapshot.requestId,
    pageUrl: snapshot.pageUrl,
    sessionId: snapshot.sessionId,
    pageContext: snapshot.pageContext,
    action: snapshot.sessionId ? "loading" : "pending",
    skill: snapshot.skill,
    hostBridge: snapshot.hostBridge,
  };
}

export function readCurrentTaskSnapshot(): WebOperatorCurrentTaskSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const snap = parsed as WebOperatorCurrentTaskSnapshot;
    if (
      typeof snap.taskId !== "string" ||
      typeof snap.source !== "string" ||
      typeof snap.requestId !== "string" ||
      typeof snap.pageUrl !== "string"
    ) {
      return null;
    }
    if (!isPageContext(snap.pageContext)) return null;
    return snap;
  } catch {
    return null;
  }
}

export function writeCurrentTaskSnapshot(task: HermesPanelTaskInput): void {
  const snap = snapshotFromTaskInput(task);
  if (!snap || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch {
    /* quota */
  }
}

export function clearCurrentTaskSnapshot(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
