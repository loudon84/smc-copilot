/**
 * Native Hermes Runtime Adapter — production local default (ADR-038 / PRD F-001).
 * Probes LOCALAPPDATA Native Root; can start/restart Gateway via Hermes CLI.
 * Work exit must not kill Gateway (A-GW-002).
 */
// @lat: [[runtime-connection#Adapter]]
import { resolve } from "path";
import type {
  HermesRuntimeAdapter,
  HermesRuntimeConnectionResult,
  HermesRuntimeProbe,
  HermesRuntimeState,
} from "../../shared/runtime/runtime-contract";
import { getHermesVersion } from "../installer";
import {
  inspectGatewayListener,
  probeGatewayAuthentication,
  probeGatewayHealth,
} from "./gateway-probe";
import { getHermesHome, getHermesProgramRoot } from "./hermes-runtime-config";
import { runHermesCliSync } from "./hermes-cli-runner";
import {
  RUNTIME_ERROR_CODES,
  runtimeErrorMessage,
  type RuntimeErrorCode,
} from "./runtime-errors";
import { locateHermesRuntime } from "./hermes-runtime-locator";

export const NATIVE_HERMES_ADAPTER_ID = "native-hermes";

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
  "The process listening on the configured Gateway port is not owned by the Native Hermes Root.";

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

function isNativeHermesRoot(homePath: string | undefined): boolean {
  const local = process.env.LOCALAPPDATA?.trim();
  if (!local || !homePath?.trim()) return false;
  return (
    resolve(homePath).toLowerCase() === resolve(local, "hermes").toLowerCase()
  );
}

function ownershipRoot(homePath: string | undefined): string {
  // Native Root ownership: accept listeners under LOCALAPPDATA\hermes (bin + venv).
  // Skip managed D:\Programs ProgramRoot conflict for Native installs.
  if (isNativeHermesRoot(homePath)) {
    return homePath!.trim();
  }
  const configuredHome = getHermesHome();
  if (isNativeHermesRoot(configuredHome)) {
    return configuredHome;
  }
  return getHermesProgramRoot();
}

function profileCliArgs(sub: string[], profile?: string): string[] {
  if (profile && profile !== "default") return ["-p", profile, ...sub];
  return sub;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitForGatewayHealth(
  endpoint: string,
  timeoutMs = 15_000,
  pollMs = 250,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeGatewayHealth(endpoint)) return true;
    await sleep(pollMs);
  }
  return probeGatewayHealth(endpoint);
}

function invokeGatewayCli(
  action: "start" | "restart",
  profile?: string,
): void {
  try {
    runHermesCliSync(profileCliArgs(["gateway", action], profile), 60_000);
  } catch {
    /* CLI may exit non-zero while service is transitioning; health poll decides. */
  }
}

async function probeNative(profile?: string): Promise<HermesRuntimeProbe> {
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
    return fail("runtime_invalid", RUNTIME_ERROR_CODES.CLI_NOT_AVAILABLE, {
      ...base,
      version,
    });
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

  // Native: LOCALAPPDATA\hermes is the desired Root — never configuration_error.
  const listen = await inspectGatewayListener(
    loc.endpoint,
    ownershipRoot(loc.homePath),
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
      // When home is Native Root, do not treat ProgramRoot mismatch as hard conflict
      // against legacy D:\Programs; re-check already used Native Root above.
      // Remaining mismatch = foreign listener outside Native Root.
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
      // Health + auth already passed. Listen inspect is best-effort OS diagnosis
      // (Get-NetTCPConnection / CIM). EPERM/AccessDenied must not block ready.
      return {
        ...authenticated,
        state: "ready",
        probedAt: Date.now(),
        runtimeContextVerified: false,
        listenerOwnership: "unknown",
      };
    default: {
      const _exhaustive: never = listen;
      return _exhaustive;
    }
  }
}

export class NativeHermesRuntimeAdapter implements HermesRuntimeAdapter {
  readonly id = NATIVE_HERMES_ADAPTER_ID;

  async probe(profile?: string): Promise<HermesRuntimeProbe> {
    try {
      return await probeNative(profile);
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
    let probe = await this.probe(profile);
    if (probe.state === "ready") {
      return resultFromProbe(probe);
    }

    // F-008 / A-GW-001: recover unreachable Gateway via Native CLI start.
    if (probe.state === "gateway_unreachable" && probe.cliAvailable) {
      invokeGatewayCli("start", profile);
      const healthy = await waitForGatewayHealth(
        probe.endpoint ?? "http://127.0.0.1:8642",
      );
      if (healthy) {
        probe = await this.probe(profile);
        return resultFromProbe(probe);
      }
    }

    return resultFromProbe(probe);
  }

  async restart(profile?: string): Promise<HermesRuntimeConnectionResult> {
    const loc = locateHermesRuntime(profile);
    if (!loc.cliAvailable) {
      return {
        ok: false,
        state: "runtime_invalid",
        profile: loc.profile,
        endpoint: loc.endpoint,
        errorCode: RUNTIME_ERROR_CODES.CLI_NOT_AVAILABLE,
        errorMessage: runtimeErrorMessage(RUNTIME_ERROR_CODES.CLI_NOT_AVAILABLE),
      };
    }

    invokeGatewayCli("restart", profile);
    const healthy = await waitForGatewayHealth(loc.endpoint);
    if (!healthy) {
      return {
        ok: false,
        state: "gateway_unreachable",
        profile: loc.profile,
        endpoint: loc.endpoint,
        errorCode: RUNTIME_ERROR_CODES.GATEWAY_UNREACHABLE,
        errorMessage: runtimeErrorMessage(
          RUNTIME_ERROR_CODES.GATEWAY_UNREACHABLE,
        ),
      };
    }
    return resultFromProbe(await this.probe(profile));
  }
}
