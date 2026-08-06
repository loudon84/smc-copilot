/**
 * v8.2 — Session catalog change event bus.
 */

import type { SessionCatalogChangedPayload } from "../../shared/session-catalog/session-catalog-contract";

export type CatalogChangedListener = (
  payload: SessionCatalogChangedPayload,
) => void;

const listeners = new Set<CatalogChangedListener>();

export function onSessionCatalogChanged(
  listener: CatalogChangedListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// @lat: [[domain/chat#Persistent mount and session catalog]]
export function emitSessionCatalogChanged(
  payload: Omit<SessionCatalogChangedPayload, "at"> & { at?: number },
): SessionCatalogChangedPayload {
  const full: SessionCatalogChangedPayload = {
    ...payload,
    at: payload.at ?? Date.now(),
  };
  for (const listener of listeners) {
    try {
      listener(full);
    } catch (err) {
      console.warn("[session-catalog-events] listener error:", err);
    }
  }
  return full;
}
