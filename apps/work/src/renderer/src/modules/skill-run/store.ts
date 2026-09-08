/**
 * Renderer Skill Run Catalog & Projection store (read-only UI cache).
 */

import type {
  SkillCatalogResponse,
  SkillRunProjection,
} from "../../../../shared/skill-run";

type Listener = () => void;

let catalogState: SkillCatalogResponse = {
  status: "loading",
  tools: [],
};

const projectionsByReq = new Map<string, SkillRunProjection>();
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

export function getSkillRunCatalogState(): SkillCatalogResponse {
  return catalogState;
}

export function setSkillRunCatalogState(state: SkillCatalogResponse): void {
  catalogState = state;
  emit();
}

export function getSkillRunProjection(
  clientRequestId: string,
): SkillRunProjection | null {
  return projectionsByReq.get(clientRequestId) ?? null;
}

export function listSkillRunProjectionsForSession(
  sessionId: string,
): SkillRunProjection[] {
  return Array.from(projectionsByReq.values())
    .filter((projection) => projection.sessionId === sessionId)
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) {
        return a.createdAt.localeCompare(b.createdAt);
      }
      return a.clientRequestId.localeCompare(b.clientRequestId);
    });
}

export function getLatestSkillRunProjectionForSession(
  sessionId: string,
): SkillRunProjection | null {
  const ordered = listSkillRunProjectionsForSession(sessionId);
  if (ordered.length === 0) return null;
  return ordered.reduce((latest, projection) =>
    projection.updatedAt > latest.updatedAt ? projection : latest,
  );
}

export function upsertSkillRunProjection(projection: SkillRunProjection): void {
  projectionsByReq.set(projection.clientRequestId, projection);
  emit();
}

export async function fetchSkillRunCatalog(
  force = false,
): Promise<SkillCatalogResponse> {
  if (typeof window === "undefined" || !window.hermesAPI?.skillRun) {
    return catalogState;
  }
  setSkillRunCatalogState({ ...catalogState, status: "loading" });
  try {
    const res = force
      ? await window.hermesAPI.skillRun.refreshCatalog()
      : await window.hermesAPI.skillRun.listCatalog();
    setSkillRunCatalogState(res);
    return res;
  } catch (err) {
    const errorState: SkillCatalogResponse = {
      status: "backend-unavailable",
      tools: [],
      reason: err instanceof Error ? err.message : String(err),
    };
    setSkillRunCatalogState(errorState);
    return errorState;
  }
}

export async function setSkillRunCatalogFavorite(
  toolName: string,
  favorited: boolean,
): Promise<SkillCatalogResponse> {
  if (
    typeof window === "undefined" ||
    !window.hermesAPI?.skillRun?.setCatalogFavorite
  ) {
    return catalogState;
  }
  try {
    const res = await window.hermesAPI.skillRun.setCatalogFavorite({
      toolName,
      favorited,
    });
    setSkillRunCatalogState(res);
    return res;
  } catch {
    return catalogState;
  }
}

export function subscribeSkillRunCatalog(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let ipcListening = false;

export function resetSkillRunStoreForTests(): void {
  catalogState = { status: "loading", tools: [] };
  projectionsByReq.clear();
  listeners.clear();
  ipcListening = false;
}

export function initSkillRunRendererListener(): () => void {
  if (ipcListening || typeof window === "undefined" || !window.hermesAPI?.skillRun) {
    return () => undefined;
  }
  ipcListening = true;
  const unsub = window.hermesAPI.skillRun.onProjectionChanged((projection) => {
    upsertSkillRunProjection(projection);
  });
  return () => {
    ipcListening = false;
    unsub();
  };
}
