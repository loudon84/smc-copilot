/**
 * Configuration / YAML control-plane bridge (Phase 2).
 * When Serve is preferred, Desktop must not write Hermes config.yaml as control plane.
 */
import { getRuntimeConnectionState } from "../copilot-runtime-client/runtime-connection-manager";
import {
  isServeControlPlaneEnabled,
  isServeControlPlanePreferred,
} from "../copilot-runtime-client/runtime-mode";
import { ServeConfigurationAdapter } from "./ServeConfigurationAdapter";
import { blockedGatewayMessage, resolveGatewayControlMode } from "./gateway-control";

export function assertLegacyYamlControlPlane(action: string): void {
  const mode = resolveGatewayControlMode();
  if (mode === "legacy") return;
  if (mode === "blocked") {
    throw new Error(`${blockedGatewayMessage()} (blocked YAML: ${action})`);
  }
  throw new Error(
    `Serve control plane enabled: Desktop must not write Hermes YAML for ${action}. Use Serve Configuration/MCP APIs.`,
  );
}

export function isServeConfigControlPlane(): boolean {
  return isServeControlPlaneEnabled(getRuntimeConnectionState().ready);
}

export function isServeConfigPreferred(): boolean {
  return isServeControlPlanePreferred();
}

export async function serveSetModelConfig(
  profileRef: string | undefined,
  input: { provider?: string; model?: string; modelId?: string; baseUrl?: string },
): Promise<void> {
  await ServeConfigurationAdapter.setModelConfig(profileRef, {
    provider: input.provider,
    model: input.model ?? input.modelId,
    modelId: input.modelId ?? input.model,
    base_url: input.baseUrl,
    baseUrl: input.baseUrl,
  });
}

export async function serveGetModelConfig(profileRef?: string) {
  return ServeConfigurationAdapter.getModelConfig(profileRef);
}

export async function servePatchConfiguration(
  profileRef: string | undefined,
  body: Record<string, unknown>,
): Promise<unknown> {
  return ServeConfigurationAdapter.patchConfiguration(profileRef, body);
}
