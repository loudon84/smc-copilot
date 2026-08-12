/**
 * RuntimeManager — facade over HermesRuntimeAdapter for IPC and Chat.
 */
import type {
  HermesRuntimeAdapter,
  HermesRuntimeConnectionResult,
  HermesRuntimeProbe,
} from "../../shared/runtime/runtime-contract";
import { RuntimeServiceAdapter } from "./runtime-service-adapter";
import { LegacyLocalRuntimeAdapter } from "./legacy-local-runtime-adapter";
import { HermesAvailabilityBackend } from "../hermes/availability-backend";
import { getHermesControlOwner } from "../hermes/control-owner";
import {
  setHermesHomeOverride,
  HERMES_HOME,
} from "./hermes-runtime-paths";
import { validateHermesHomeDir } from "./hermes-runtime-locator";

function defaultAdapter(): HermesRuntimeAdapter {
  const owner = getHermesControlOwner();
  switch (owner) {
    case "salt":
      // Probe-only Availability (Gateway :8642 /health). No Runtime :8765.
      return new HermesAvailabilityBackend();
    case "direct":
      // Default Work path: locate Hermes home + probe/start Gateway locally.
      return new LegacyLocalRuntimeAdapter();
    case "runtime":
      // Opt-in Copilot Runtime HTTP control plane (:8765).
      return new RuntimeServiceAdapter();
    default: {
      const _exhaustive: never = owner;
      throw new Error(`Unknown control owner: ${_exhaustive}`);
    }
  }
}

export class RuntimeManager {
  private adapter: HermesRuntimeAdapter;
  private lastProbe: HermesRuntimeProbe | null = null;
  private listeners = new Set<(probe: HermesRuntimeProbe) => void>();

  constructor(adapter?: HermesRuntimeAdapter) {
    this.adapter = adapter ?? defaultAdapter();
  }

  setAdapter(adapter: HermesRuntimeAdapter): void {
    this.adapter = adapter;
  }

  onStatusChanged(listener: (probe: HermesRuntimeProbe) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(probe: HermesRuntimeProbe): void {
    this.lastProbe = probe;
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
    // Refresh and broadcast full probe after ensure.
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
      return { ok: false, hermesHome: HERMES_HOME, error: "Path is empty" };
    }
    if (!validateHermesHomeDir(trimmed)) {
      return {
        ok: false,
        hermesHome: HERMES_HOME,
        error: "Directory is not a valid Hermes home",
      };
    }
    setHermesHomeOverride(trimmed);
    return { ok: true, hermesHome: trimmed };
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
