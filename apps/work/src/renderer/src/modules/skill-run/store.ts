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

export function getLatestSkillRunProjectionForSession(
  sessionId: string,
): SkillRunProjection | null {
  let latest: SkillRunProjection | null = null;
  for (const proj of projectionsByReq.values()) {
    if (proj.sessionId === sessionId) {
      if (!latest || proj.updatedAt > latest.updatedAt) {
        latest = proj;
      }
    }
  }
  return latest;
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
