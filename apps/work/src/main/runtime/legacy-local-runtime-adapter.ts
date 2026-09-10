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
import { resolve } from "path";
import { getHermesVersion } from "../installer";
import {
  inspectGatewayListener,
  probeGatewayAuthentication,
  probeGatewayHealth,
} from "./gateway-probe";
import { getHermesProgramRoot } from "./hermes-runtime-config";
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

const CONFLICT_OWNERSHIP_MESSAGE =
  "The process listening on the configured Gateway port is not owned by the managed Hermes ProgramRoot. Repair belongs to the endpoint management service.";

function fail(
  state: HermesRuntimeState,
  code: RuntimeErrorCode | "CONFLICT",
  base: Omit<
    HermesRuntimeProbe,
    "state" | "errorCode" | "errorMessage" | "probedAt"
  >,
  message?: string,
  extras?: Pick<HermesRuntimeProbe, "listenerOwnership" | "listenerExecutable">,
): HermesRuntimeProbe {
  return {
    ...base,
    state,
    errorCode: code,
    errorMessage:
      message ??
      (code === "CONFLICT"
        ? CONFLICT_OWNERSHIP_MESSAGE
        : runtimeErrorMessage(code)),
    probedAt: Date.now(),
    runtimeContextVerified: false,
    listenerOwnership: extras?.listenerOwnership ?? "unknown",
    listenerExecutable: extras?.listenerExecutable,
  };
}

function isForbiddenSelfInstallHome(homePath: string | undefined): boolean {
  const local = process.env.LOCALAPPDATA?.trim();
  if (!local || !homePath?.trim()) return false;
  return resolve(homePath).toLowerCase() === resolve(local, "hermes").toLowerCase();
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

  const authenticated = {
    ...withStatus,
    authenticated: true,
  };

  if (isForbiddenSelfInstallHome(loc.homePath)) {
    return fail(
      "configuration_error",
      RUNTIME_ERROR_CODES.CONFIGURATION_ERROR,
      authenticated,
      "Hermes home must not be the per-user AppData hermes directory.",
    );
  }

  const listen = await inspectGatewayListener(
    loc.endpoint,
    getHermesProgramRoot(),
  );
  switch (listen.status) {
    case "not_required":
      return {
        ...authenticated,
        state: "ready",
        probedAt: Date.now(),
        runtimeContextVerified: false,
        listenerOwnership: "unknown",
      };
    case "match":
      return {
        ...authenticated,
        state: "ready",
        probedAt: Date.now(),
        runtimeContextVerified: true,
        listenerOwnership: "managed",
        listenerExecutable: listen.actualPath,
      };
    case "mismatch":
      return fail(
        "conflict",
        "CONFLICT",
        authenticated,
        CONFLICT_OWNERSHIP_MESSAGE,
        {
          listenerOwnership: "foreign",
          listenerExecutable: listen.actualPath,
        },
      );
    case "no_listener":
      return fail(
        "configuration_error",
        RUNTIME_ERROR_CODES.CONFIGURATION_ERROR,
        authenticated,
        "Gateway health succeeded but no local listener was found on the configured port.",
        { listenerOwnership: "unknown" },
      );
    case "inspect_failed":
      return fail(
        "configuration_error",
        RUNTIME_ERROR_CODES.CONFIGURATION_ERROR,
        authenticated,
        `Gateway listen inspect failed: ${listen.reason}`,
        { listenerOwnership: "unknown" },
      );
    default: {
      const _exhaustive: never = listen;
      return _exhaustive;
    }
  }
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
