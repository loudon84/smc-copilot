/**
 * HermesAvailabilityBackend — probe-only Connection Ready for Salt mode.
 * Does not install, spawn Gateway, or call Runtime HTTP.
 */
// @lat: [[runtime-connection#Hermes Availability Backend]]
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type {
  HermesRuntimeAdapter,
  HermesRuntimeConnectionResult,
  HermesRuntimeProbe,
  HermesRuntimeState,
} from "../../shared/runtime/runtime-contract";
import { locateHermesRuntime } from "../runtime/hermes-runtime-locator";
import { getApiUrl, isGatewayHealthy } from "./transport/gateway-http";
import { getApiServerKey } from "../config";
import { saltManagedMessage } from "./control-owner";

function readInstalledVersion(homePath: string): string | undefined {
  const marker = join(homePath, "active.json");
  if (!existsSync(marker)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(marker, "utf-8")) as {
      version?: unknown;
    };
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

function stateFromProbe(input: {
  runtimeFound: boolean;
  runtimeValid: boolean;
  gatewayHealthy: boolean;
}): HermesRuntimeState {
  if (!input.runtimeFound) return "runtime_missing";
  if (!input.runtimeValid) return "runtime_invalid";
  if (!input.gatewayHealthy) return "gateway_unreachable";
  return "ready";
}

export class HermesAvailabilityBackend implements HermesRuntimeAdapter {
  async probe(profile?: string): Promise<HermesRuntimeProbe> {
    const location = locateHermesRuntime(profile);
    let endpoint = location.endpoint;
    try {
      endpoint = getApiUrl(profile);
    } catch {
      /* keep locator endpoint */
    }
    const gatewayHealthy = await isGatewayHealthy(profile);
    const apiKey = getApiServerKey(profile)?.trim() ?? "";
    const authenticated = gatewayHealthy && apiKey.length > 0;
    const state = stateFromProbe({
      runtimeFound: location.runtimeFound,
      runtimeValid: location.runtimeValid,
      gatewayHealthy,
    });
    const errorMessage =
      state === "ready"
        ? undefined
        : state === "runtime_missing"
          ? saltManagedMessage("Hermes install")
          : state === "gateway_unreachable"
            ? saltManagedMessage("Gateway start")
            : "Hermes Agent is not ready";
    return {
      mode: "local",
      state,
      profile: location.profile,
      homePath: location.homePath,
      executablePath: location.executablePath,
      endpoint,
      runtimeFound: location.runtimeFound,
      cliAvailable: location.cliAvailable,
      gatewayRunning: gatewayHealthy,
      gatewayHealthy,
      authenticated,
      version: readInstalledVersion(location.homePath),
      errorCode: state === "ready" ? undefined : state.toUpperCase(),
      errorMessage,
      probedAt: Date.now(),
    };
  }

  async getStatus(profile?: string): Promise<HermesRuntimeProbe> {
    return this.probe(profile);
  }

  async ensureReady(
    profile?: string,
  ): Promise<HermesRuntimeConnectionResult> {
    const probe = await this.probe(profile);
    return {
      ok: probe.state === "ready",
      state: probe.state,
      profile: probe.profile,
      endpoint: probe.endpoint,
      version: probe.version,
      errorCode: probe.errorCode,
      errorMessage: probe.errorMessage,
    };
  }

  async restart(
    profile?: string,
  ): Promise<HermesRuntimeConnectionResult> {
    const probe = await this.probe(profile);
    return {
      ok: false,
      state: probe.state,
      profile: probe.profile,
      endpoint: probe.endpoint,
      version: probe.version,
      errorCode: "SALT_MANAGED",
      errorMessage: saltManagedMessage("Restart Gateway"),
    };
  }
}
