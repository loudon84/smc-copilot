/**
 * HermesAvailabilityBackend — probe-only Connection Ready for Salt mode.
 * Does not install, spawn Gateway, or call Runtime HTTP.
 */
// @lat: [[runtime-connection#Hermes Availability Backend]]
import http from "http";
import https from "https";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type {
  HermesRuntimeAdapter,
  HermesRuntimeConnectionResult,
  HermesRuntimeProbe,
  HermesRuntimeState,
} from "../../shared/runtime/runtime-contract";
import { locateHermesRuntime } from "../runtime/hermes-runtime-locator";
import { getApiUrl } from "../hermes";
import { saltManagedMessage } from "./control-owner";

function probeGatewayHealth(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const target = `${url.replace(/\/$/, "")}/health`;
      const mod = target.startsWith("https") ? https : http;
      const req = mod.request(
        target,
        { method: "GET", timeout: 1500 },
        (res) => {
          resolve(res.statusCode === 200);
          res.resume();
        },
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    } catch {
      resolve(false);
    }
  });
}

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
    const gatewayHealthy = await probeGatewayHealth(endpoint);
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
      authenticated: gatewayHealthy,
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
