/**
 * Legacy local Runtime Adapter — locates and starts an existing Hermes
 * Gateway. Does not install, upgrade, or write model API keys.
 */
// @lat: [[runtime-connection#Adapter]]
import type {
  HermesRuntimeAdapter,
  HermesRuntimeConnectionResult,
  HermesRuntimeProbe,
  HermesRuntimeState,
} from "../../shared/runtime/runtime-contract";
import { getApiServerKey } from "../config";
import {
  getApiUrl,
  isGatewayHealthy,
  isGatewayRunning,
  restartGateway,
  startGatewayWithRecovery,
} from "../hermes";
import { getHermesVersion } from "../installer";
import {
  RUNTIME_ERROR_CODES,
  runtimeErrorMessage,
  type RuntimeErrorCode,
} from "./runtime-errors";
import { locateHermesRuntime } from "./hermes-runtime-locator";

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
  if (!loc.cliAvailable) {
    return fail(
      "runtime_invalid",
      RUNTIME_ERROR_CODES.CLI_NOT_AVAILABLE,
      base,
    );
  }

  let version: string | undefined;
  try {
    version = (await getHermesVersion()) ?? undefined;
  } catch {
    version = undefined;
  }

  const running = isGatewayRunning(profile);
  const healthy = running ? await isGatewayHealthy(profile) : false;
  const apiKey = getApiServerKey(profile)?.trim() ?? "";
  const authenticated = healthy && apiKey.length > 0;

  const withStatus = {
    ...base,
    gatewayRunning: running,
    gatewayHealthy: healthy,
    authenticated,
    version,
  };

  if (!running) {
    return fail(
      "gateway_stopped",
      RUNTIME_ERROR_CODES.GATEWAY_UNREACHABLE,
      withStatus,
      runtimeErrorMessage(RUNTIME_ERROR_CODES.GATEWAY_UNREACHABLE),
    );
  }
  if (!healthy) {
    return fail(
      "gateway_unreachable",
      RUNTIME_ERROR_CODES.GATEWAY_UNREACHABLE,
      withStatus,
    );
  }
  if (!authenticated) {
    return fail(
      "gateway_auth_failed",
      RUNTIME_ERROR_CODES.GATEWAY_AUTH_FAILED,
      withStatus,
    );
  }

  return {
    ...withStatus,
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
    const initial = await this.probe(profile);
    if (initial.state === "ready") {
      return resultFromProbe(initial);
    }
    if (
      initial.state === "runtime_missing" ||
      initial.state === "runtime_invalid" ||
      initial.state === "configuration_error"
    ) {
      return resultFromProbe(initial);
    }

    // Gateway stopped or unhealthy — attempt start/recovery.
    const started = await startGatewayWithRecovery(profile);
    if (!started) {
      const after = await this.probe(profile);
      if (after.state === "ready") return resultFromProbe(after);
      return {
        ok: false,
        state: after.gatewayRunning ? "gateway_unreachable" : "gateway_stopped",
        profile: after.profile,
        endpoint: after.endpoint,
        version: after.version,
        errorCode: after.gatewayRunning
          ? RUNTIME_ERROR_CODES.GATEWAY_TIMEOUT
          : RUNTIME_ERROR_CODES.GATEWAY_START_FAILED,
        errorMessage: after.gatewayRunning
          ? runtimeErrorMessage(RUNTIME_ERROR_CODES.GATEWAY_TIMEOUT)
          : runtimeErrorMessage(RUNTIME_ERROR_CODES.GATEWAY_START_FAILED),
      };
    }

    // Re-probe for auth + health after start.
    const finalProbe = await this.probe(profile);
    if (finalProbe.state === "ready") {
      // Ensure endpoint reflects live getApiUrl when possible.
      try {
        finalProbe.endpoint = getApiUrl(profile);
      } catch {
        /* keep locator endpoint */
      }
    }
    return resultFromProbe(finalProbe);
  }

  async restart(profile?: string): Promise<HermesRuntimeConnectionResult> {
    const loc = locateHermesRuntime(profile);
    if (!loc.runtimeFound) {
      return {
        ok: false,
        state: "runtime_missing",
        profile: loc.profile,
        endpoint: loc.endpoint,
        errorCode: RUNTIME_ERROR_CODES.RUNTIME_NOT_FOUND,
        errorMessage: runtimeErrorMessage(
          RUNTIME_ERROR_CODES.RUNTIME_NOT_FOUND,
        ),
      };
    }
    if (!loc.runtimeValid || !loc.cliAvailable) {
      return {
        ok: false,
        state: "runtime_invalid",
        profile: loc.profile,
        endpoint: loc.endpoint,
        errorCode: RUNTIME_ERROR_CODES.RUNTIME_INVALID,
        errorMessage: runtimeErrorMessage(RUNTIME_ERROR_CODES.RUNTIME_INVALID),
      };
    }

    const ok = await restartGateway(profile);
    if (!ok) {
      return {
        ok: false,
        state: "gateway_unreachable",
        profile: loc.profile,
        endpoint: loc.endpoint,
        errorCode: RUNTIME_ERROR_CODES.GATEWAY_START_FAILED,
        errorMessage: runtimeErrorMessage(
          RUNTIME_ERROR_CODES.GATEWAY_START_FAILED,
        ),
      };
    }
    return resultFromProbe(await this.probe(profile));
  }
}
