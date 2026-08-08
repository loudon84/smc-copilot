import type { RuntimeConnectionState, RuntimeReadinessView } from "../../../../shared/copilot-runtime";
import { assertRuntimeReadyForWrite } from "../../hooks/useCopilotRuntime";

/**
 * PRD v1.4 Domain Gate — Chat/Task/MCP/Expert use readiness domains; no legacy fallback.
 */
async function loadReadiness(): Promise<RuntimeReadinessView | null> {
  if (!window.copilotRuntime?.getReadiness) {
    throw new Error("Current Runtime does not support readiness v2. Please update Runtime.");
  }
  return window.copilotRuntime.getReadiness();
}

export async function ensureRuntimeReadyForWrite(): Promise<void> {
  if (!window.copilotRuntime?.getState) {
    throw new Error("Runtime connection API unavailable. Chat / Task writes are blocked.");
  }
  const state: RuntimeConnectionState = await window.copilotRuntime.getState();
  const reason = assertRuntimeReadyForWrite(state);
  if (reason) {
    throw new Error(reason);
  }
  const readiness = await loadReadiness();
  if (readiness && readiness.execution.chatReady === false) {
    throw new Error(
      "Agent execution unavailable. No healthy Hermes Instance. Open Runtime & Agent → Hermes Instances.",
    );
  }
  if (readiness && readiness.execution.ready === false) {
    throw new Error(
      "Agent execution unavailable. Chat / Task writes are gated until Hermes execution is ready.",
    );
  }
}

export async function ensureRuntimeReadyForTask(): Promise<void> {
  await ensureRuntimeReadyForWrite();
  const readiness = await loadReadiness();
  if (readiness && readiness.execution.taskReady === false) {
    throw new Error(
      "Task execution unavailable. Hermes Instance is not task-ready. Open Runtime & Agent → Hermes Instances.",
    );
  }
}

export async function ensureRuntimeReadyForMcp(): Promise<void> {
  if (!window.copilotRuntime?.getState) {
    throw new Error("Runtime connection API unavailable. MCP writes are blocked.");
  }
  const state = await window.copilotRuntime.getState();
  if (!state.ready) {
    throw new Error("Runtime service unavailable. MCP writes require a Ready Runtime connection.");
  }
  const readiness = await loadReadiness();
  if (readiness && readiness.service.ready === false) {
    throw new Error("Runtime service domain not ready. Please update Runtime or check Runtime & Agent.");
  }
}

export function isRuntimeReadyForWrite(state: RuntimeConnectionState): boolean {
  return assertRuntimeReadyForWrite(state) === null;
}

export async function ensureExpertMcpReady(): Promise<void> {
  const readiness = await loadReadiness();
  if (!readiness?.expertMcp.ready) {
    throw new Error("Expert tools unavailable. Expert MCP Gateway is offline.");
  }
}

export async function ensureMaintenanceReady(): Promise<void> {
  const readiness = await loadReadiness();
  if (!readiness?.maintenance.ready) {
    throw new Error("Update service unavailable. Hermes update/maintenance is not ready.");
  }
}
