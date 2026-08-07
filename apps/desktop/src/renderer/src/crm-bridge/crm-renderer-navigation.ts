import { useSyncExternalStore } from "react";
import {
  resolveCrmRendererRoute,
  type CrmRendererRouteDefinition,
} from "../../../shared/crm-bridge/crm-renderer-routes";
import type { CrmBridgeStoredEvent } from "../../../shared/crm-bridge";

export interface CrmRendererNavigationState {
  route: CrmRendererRouteDefinition | null;
  lastEvent: CrmBridgeStoredEvent | null;
}

let state: CrmRendererNavigationState = {
  route: null,
  lastEvent: null,
};

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): CrmRendererNavigationState {
  return state;
}

/** Apply CRM bridge `route` and optional triggering event. */
export function navigateCrmRendererRoute(
  route: string,
  event?: CrmBridgeStoredEvent,
): boolean {
  const resolved = resolveCrmRendererRoute(route);
  if (!resolved) return false;
  state = {
    route: resolved,
    lastEvent: event ?? state.lastEvent,
  };
  emit();
  return true;
}

export function setCrmRendererLastEvent(event: CrmBridgeStoredEvent): void {
  state = { ...state, lastEvent: event };
  emit();
}

export function useCrmRendererNavigation(): CrmRendererNavigationState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
