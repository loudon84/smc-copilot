import type { RuntimeConnectionState } from "../../../../shared/copilot-runtime";
import { assertRuntimeReadyForWrite } from "../../hooks/useCopilotRuntime";

/**
 * PRD v1.3.1 §8 — block Chat/Task mutating actions until Runtime is Ready.
 * Prefer this over calling Hermes Gateway from Renderer/Main write paths.
 */
export async function ensureRuntimeReadyForWrite(): Promise<void> {
  if (!window.copilotRuntime?.getState) {
    throw new Error("Runtime connection API unavailable. Chat / Task writes are blocked.");
  }
  const state: RuntimeConnectionState = await window.copilotRuntime.getState();
  const reason = assertRuntimeReadyForWrite(state);
  if (reason) {
    throw new Error(reason);
  }
}

export function isRuntimeReadyForWrite(state: RuntimeConnectionState): boolean {
  return assertRuntimeReadyForWrite(state) === null;
}
