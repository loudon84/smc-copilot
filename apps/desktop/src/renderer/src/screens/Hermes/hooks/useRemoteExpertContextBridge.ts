import { useEffect } from "react";
import {
  REMOTE_EXPERT_CONTEXT_EVENT,
  savePageContextForRemoteExpert,
} from "../utils/remote-expert-context";
import type { RemoteRunContext } from "../../../../../shared/hermes-experts/hermes-experts-contract";

/**
 * Listens for cross-surface context (WebOperator / Portal / custom events)
 * and stores it for the next tools/call summon.
 */
export function useRemoteExpertContextBridge(): void {
  useEffect(() => {
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<Partial<RemoteRunContext>>).detail;
      if (detail && typeof detail === "object") {
        savePageContextForRemoteExpert(detail);
      }
    };
    window.addEventListener(REMOTE_EXPERT_CONTEXT_EVENT, onEvent);
    return () => window.removeEventListener(REMOTE_EXPERT_CONTEXT_EVENT, onEvent);
  }, []);
}

export function publishRemoteExpertContext(context: Partial<RemoteRunContext>): void {
  savePageContextForRemoteExpert(context);
  window.dispatchEvent(new CustomEvent(REMOTE_EXPERT_CONTEXT_EVENT, { detail: context }));
}
