/**
 * Renderer Expert UI projection store — not task truth.
 */

import type { ExpertRunProjection } from "../../../../shared/expert";

type Listener = () => void;

let projectionsById = new Map<string, ExpertRunProjection>();
const listeners = new Set<Listener>();
let unsubscribeIpc: (() => void) | null = null;

function emit(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

export function getExpertProjections(): ExpertRunProjection[] {
  return Array.from(projectionsById.values()).sort((a, b) =>
    a.updatedAt < b.updatedAt ? 1 : -1,
  );
}

export function getExpertProjectionsForSession(
  sessionId: string,
): ExpertRunProjection[] {
  return getExpertProjections().filter((p) => p.sessionId === sessionId);
}

export function upsertExpertProjection(projection: ExpertRunProjection): void {
  projectionsById.set(projection.clientRequestId, projection);
  emit();
}

export function clearExpertProjections(): void {
  projectionsById = new Map();
  emit();
}

export function subscribeExpertProjections(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Attach Main→Renderer projection push once per app lifetime. */
export function ensureExpertProjectionSubscription(): void {
  if (unsubscribeIpc) return;
  if (typeof window === "undefined" || !window.hermesAPI?.expert) return;
  unsubscribeIpc = window.hermesAPI.expert.onProjectionChanged((projection) => {
    upsertExpertProjection(projection);
  });
}

export function resetExpertProjectionStoreForTests(): void {
  unsubscribeIpc?.();
  unsubscribeIpc = null;
  clearExpertProjections();
  listeners.clear();
}
