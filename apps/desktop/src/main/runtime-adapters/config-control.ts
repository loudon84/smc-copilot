/**
 * Configuration / YAML control-plane bridge (Phase 2).
 * When Serve is preferred, Desktop must not write Hermes config.yaml as control plane.
 */
import { getRuntimeConnectionState } from "../copilot-runtime-client/runtime-connection-manager";
import { isRuntimeServiceReady } from "../copilot-runtime-client/runtime-capability-manager";
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

/**
 * Configuration control plane is live when Serve is preferred and Runtime
 * **service** domain is ready (PRD v1.5.4).
 *
 * Do not require Connection `ready` alone — that also waits on pairing and
 * collapses Chat gates. PairingRequired still exposes serviceReady=true when
 * readiness was fetched; local model-config APIs work without device token
 * when RUNTIME_REQUIRE_AUTH=false.
 */
export function isServeConfigControlPlane(): boolean {
  if (!isServeControlPlanePreferred()) return false;
  const state = getRuntimeConnectionState();
  return (
    state.ready === true ||
    state.serviceReady === true ||
    isRuntimeServiceReady() ||
    isServeControlPlaneEnabled(state.ready)
  );
}

export function isServeConfigPreferred(): boolean {
  return isServeControlPlanePreferred();
}

/**
 * True when Serve config writes may proceed: cached serviceReady, or a live
 * health probe against Runtime :8765 succeeds.
 */
export async function ensureServeConfigReachable(): Promise<boolean> {
  if (!isServeControlPlanePreferred()) return false;
  if (isServeConfigControlPlane()) return true;
  const { probeHealth } = await import(
    "../copilot-runtime-client/runtime-connection-manager"
  );
  const { resolveServeBaseUrl } = await import(
    "../copilot-runtime-client/runtime-mode"
  );
  return (await probeHealth(resolveServeBaseUrl())).reachable;
}

/**
 * PUT Runtime /chat/model-config with snake_case + camelCase fields.
 * ``modelId`` must be the Hermes execution model name (not models.json UUID).
 */
export async function serveSetModelConfig(
  profileRef: string | undefined,
  input: {
    provider?: string;
    model?: string;
    modelId?: string;
    modelLabel?: string;
    baseUrl?: string;
  },
): Promise<void> {
  const modelId = (input.modelId ?? input.model ?? "").trim();
  if (!modelId) {
    throw new Error("modelId is required");
  }
  const provider = (input.provider ?? "auto").trim() || "auto";
  const baseUrl = input.baseUrl?.trim()
    ? input.baseUrl.trim().replace(/\/+$/, "")
    : undefined;
  await ServeConfigurationAdapter.setModelConfig(profileRef, {
    provider,
    model_id: modelId,
    modelId,
    model_label: input.modelLabel ?? modelId,
    modelLabel: input.modelLabel ?? modelId,
    base_url: baseUrl ?? null,
    baseUrl: baseUrl ?? null,
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

/** Patch Hermes ``custom_providers`` via Runtime configuration API. */
export async function servePatchCustomProviders(
  profileRef: string | undefined,
  providers: unknown[],
): Promise<void> {
  await ServeConfigurationAdapter.patchConfiguration(profileRef, {
    values: { custom_providers: providers },
    apply: false,
  });
}
