/**
 * RuntimeManager — facade over HermesRuntimeAdapter for IPC and Chat.
 */
// @lat: [[runtime-connection#Adapter freeze]]
import type {
  HermesRuntimeAdapter,
  HermesRuntimeConnectionResult,
  HermesRuntimeProbe,
} from "../../shared/runtime/runtime-contract";
import {
  DEFAULT_RUNTIME_ADAPTER,
  DEFAULT_RUNTIME_CONTRACT,
} from "../build-info";
import { readControlOwnerSnapshot } from "../hermes/control-owner";
import { LegacyLocalRuntimeAdapter } from "./legacy-local-runtime-adapter";
import {
  setHermesHomeOverride,
  getHermesHome,
  invalidateHermesRuntimeConfigCache,
} from "./hermes-runtime-paths";
import { validateHermesHomeDir } from "./hermes-runtime-locator";

export const RUNTIME_ADAPTER_ID = DEFAULT_RUNTIME_ADAPTER;
export const RUNTIME_CONTRACT_ID = DEFAULT_RUNTIME_CONTRACT;

export class RuntimeManager {
  private adapter: HermesRuntimeAdapter;
  private lastProbe: HermesRuntimeProbe | null = null;
  private lastLoggedSignature = "";
  private listeners = new Set<(probe: HermesRuntimeProbe) => void>();

  constructor(adapter?: HermesRuntimeAdapter) {
    this.adapter = adapter ?? new LegacyLocalRuntimeAdapter();
  }

  /** @internal Test-only adapter injection; production must not call this. */
  setAdapter(adapter: HermesRuntimeAdapter): void {
    this.adapter = adapter;
  }

  getAdapterIdentity(): { adapter: string; contract: string } {
    return {
      adapter: RUNTIME_ADAPTER_ID,
      contract: RUNTIME_CONTRACT_ID,
    };
  }

  onStatusChanged(listener: (probe: HermesRuntimeProbe) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private logProbeIfChanged(probe: HermesRuntimeProbe): void {
    const signature = [
      probe.state,
      probe.endpoint ?? "",
      probe.homePath ?? "",
      probe.executablePath ?? "",
      probe.gatewayHealthy ? "1" : "0",
      probe.authenticated ? "1" : "0",
      probe.errorCode ?? "",
    ].join("|");
    if (signature === this.lastLoggedSignature) return;
    this.lastLoggedSignature = signature;
    const owner = readControlOwnerSnapshot().owner;
    console.info(
      JSON.stringify({
        event: "hermes_runtime_probe",
        runtimeAdapter: RUNTIME_ADAPTER_ID,
        runtimeContract: RUNTIME_CONTRACT_ID,
        controlOwner: owner,
        state: probe.state,
        endpoint: probe.endpoint,
        homePath: probe.homePath,
        executablePath: probe.executablePath,
        gatewayHealthy: probe.gatewayHealthy,
        authenticated: probe.authenticated,
        errorCode: probe.errorCode ?? null,
      }),
    );
  }

  private emit(probe: HermesRuntimeProbe): void {
    this.lastProbe = probe;
    this.logProbeIfChanged(probe);
    for (const listener of this.listeners) {
      try {
        listener(probe);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  async probe(profile?: string): Promise<HermesRuntimeProbe> {
    const probe = await this.adapter.probe(profile);
    this.emit(probe);
    return probe;
  }

  async getStatus(profile?: string): Promise<HermesRuntimeProbe> {
    const probe = await this.adapter.getStatus(profile);
    this.emit(probe);
    return probe;
  }

  async ensureReady(
    profile?: string,
  ): Promise<HermesRuntimeConnectionResult> {
    const result = await this.adapter.ensureReady(profile);
    await this.probe(profile);
    return result;
  }

  async restart(profile?: string): Promise<HermesRuntimeConnectionResult> {
    const result = await this.adapter.restart(profile);
    await this.probe(profile);
    return result;
  }

  validateHome(path: string): boolean {
    return validateHermesHomeDir(path);
  }

  adoptHome(path: string): { ok: boolean; hermesHome: string; error?: string } {
    const trimmed = path?.trim() ?? "";
    if (!trimmed) {
      return { ok: false, hermesHome: getHermesHome(), error: "Path is empty" };
    }
    if (!validateHermesHomeDir(trimmed)) {
      return {
        ok: false,
        hermesHome: getHermesHome(),
        error: "Directory is not a valid Hermes home",
      };
    }
    setHermesHomeOverride(trimmed);
    invalidateHermesRuntimeConfigCache();
    return { ok: true, hermesHome: getHermesHome() };
  }

  getLastProbe(): HermesRuntimeProbe | null {
    return this.lastProbe;
  }
}

let singleton: RuntimeManager | null = null;

export function getRuntimeManager(): RuntimeManager {
  if (!singleton) singleton = new RuntimeManager();
  return singleton;
}

/** Test helper — replace the singleton. */
export function setRuntimeManagerForTests(manager: RuntimeManager | null): void {
  singleton = manager;
}
