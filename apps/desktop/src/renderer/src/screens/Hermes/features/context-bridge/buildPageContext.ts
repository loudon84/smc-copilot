import type { RemoteRunContext } from "../../../../../../shared/hermes-experts/hermes-experts-contract";

const PAGE_CONTEXT_KEY = "hermes-remote-page-context-v1";

export function buildPageContextFromStorage(): RemoteRunContext | undefined {
  try {
    const raw = sessionStorage.getItem(PAGE_CONTEXT_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as RemoteRunContext;
  } catch {
    return undefined;
  }
}

export function savePageContextForRemoteExpert(context: Partial<RemoteRunContext>): void {
  try {
    const existing = buildPageContextFromStorage();
    const merged = {
      ...existing,
      ...context,
      source: context.source ?? existing?.source ?? "copilot-desktop",
    };
    sessionStorage.setItem(PAGE_CONTEXT_KEY, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
}
