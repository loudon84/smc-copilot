/**
 * Managed local Hermes Runtime Consumer — probe and connect only.
 * OPSI owns Gateway process lifecycle; Work must not spawn or kill Gateway.
 */
// @lat: [[runtime-connection#Adapter]]
import type {
  HermesRuntimeAdapter,
  HermesRuntimeConnectionResult,
  HermesRuntimeProbe,
  HermesRuntimeState,
} from "../../shared/runtime/runtime-contract";
import { getHermesVersion } from "../installer";
import {
  probeGatewayAuthentication,
  probeGatewayHealth,
} from "./gateway-probe";
import {
  RUNTIME_ERROR_CODES,
  runtimeErrorMessage,
  type RuntimeErrorCode,
} from "./runtime-errors";
import { locateHermesRuntime } from "./hermes-runtime-locator";
import { MANAGED_GATEWAY_MESSAGE } from "./hermes-runtime-paths";

function resultFromProbe(
  probe: HermesRuntimeProbe,
): HermesRuntimeConnectionResult {
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

function fail(
  state: HermesRuntimeState,
  code: RuntimeErrorCode,
  base: Omit<
    HermesRuntimeProbe,
    "state" | "errorCode" | "errorMessage" | "probedAt"
  >,
  message?: string,
): HermesRuntimeProbe {
  return {
    ...base,
    state,
    errorCode: code,
    errorMessage: message ?? runtimeErrorMessage(code),
    probedAt: Date.now(),
  };
}

async function probeLocal(profile?: string): Promise<HermesRuntimeProbe> {
  const loc = locateHermesRuntime(profile);
  const base = {
    mode: "local" as const,
    profile: loc.profile,
    homePath: loc.homePath,
    executablePath: loc.executablePath,
    endpoint: loc.endpoint,
    runtimeFound: loc.runtimeFound,
    cliAvailable: loc.cliAvailable,
    gatewayRunning: false,
    gatewayHealthy: false,
    authenticated: false,
  };

  if (!loc.runtimeFound) {
    return fail("runtime_missing", RUNTIME_ERROR_CODES.RUNTIME_NOT_FOUND, base);
  }
  if (!loc.runtimeValid) {
    return fail("runtime_invalid", RUNTIME_ERROR_CODES.RUNTIME_INVALID, base);
  }

  let version: string | undefined;
  try {
    version = (await getHermesVersion()) ?? undefined;
  } catch {
    version = undefined;
  }

  if (!loc.cliAvailable && !version) {
    return fail(
      "runtime_invalid",
      RUNTIME_ERROR_CODES.CLI_NOT_AVAILABLE,
      { ...base, version },
    );
  }

  const gatewayHealthy = await probeGatewayHealth(loc.endpoint);
  const gatewayRunning = gatewayHealthy;
  const withStatus = {
    ...base,
    gatewayRunning,
    gatewayHealthy,
    version,
  };

  if (!gatewayHealthy) {
    return fail(
      "gateway_unreachable",
      RUNTIME_ERROR_CODES.GATEWAY_UNREACHABLE,
      withStatus,
    );
  }

  const authResult = await probeGatewayAuthentication(profile, loc.endpoint);
  if (authResult === "unauthorized") {
    return fail(
      "gateway_auth_failed",
      RUNTIME_ERROR_CODES.GATEWAY_AUTH_FAILED,
      { ...withStatus, authenticated: false },
    );
  }
  if (authResult === "unreachable") {
    return fail(
      "gateway_unreachable",
      RUNTIME_ERROR_CODES.GATEWAY_UNREACHABLE,
      withStatus,
    );
  }

  return {
    ...withStatus,
    authenticated: true,
    state: "ready",
    probedAt: Date.now(),
  };
}

export class LegacyLocalRuntimeAdapter implements HermesRuntimeAdapter {
  async probe(profile?: string): Promise<HermesRuntimeProbe> {
    try {
      return await probeLocal(profile);
    } catch (err) {
      const loc = locateHermesRuntime(profile);
      return fail(
        "configuration_error",
        RUNTIME_ERROR_CODES.CONFIGURATION_ERROR,
        {
          mode: "local",
          profile: loc.profile,
          homePath: loc.homePath,
          executablePath: loc.executablePath,
          endpoint: loc.endpoint,
          runtimeFound: loc.runtimeFound,
          cliAvailable: loc.cliAvailable,
          gatewayRunning: false,
          gatewayHealthy: false,
          authenticated: false,
        },
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async getStatus(profile?: string): Promise<HermesRuntimeProbe> {
    return this.probe(profile);
  }

  async ensureReady(
    profile?: string,
  ): Promise<HermesRuntimeConnectionResult> {
    return resultFromProbe(await this.probe(profile));
  }

  async restart(profile?: string): Promise<HermesRuntimeConnectionResult> {
    const loc = locateHermesRuntime(profile);
    return {
      ok: false,
      state: "gateway_unreachable",
      profile: loc.profile,
      endpoint: loc.endpoint,
      errorCode: RUNTIME_ERROR_CODES.MANAGED_RUNTIME_RESTART_REQUIRED,
      errorMessage: MANAGED_GATEWAY_MESSAGE,
    };
  }
}
