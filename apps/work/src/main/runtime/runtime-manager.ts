/**
 * RuntimeManager — facade over HermesRuntimeAdapter for IPC and Chat.
 */
import type {
  HermesRuntimeAdapter,
  HermesRuntimeConnectionResult,
  HermesRuntimeProbe,
} from "../../shared/runtime/runtime-contract";
import { LegacyLocalRuntimeAdapter } from "./legacy-local-runtime-adapter";
import {
  setHermesHomeOverride,
  getHermesHome,
  invalidateHermesRuntimeConfigCache,
} from "./hermes-runtime-paths";
import { validateHermesHomeDir } from "./hermes-runtime-locator";

export class RuntimeManager {
  private adapter: HermesRuntimeAdapter;
  private lastProbe: HermesRuntimeProbe | null = null;
  private listeners = new Set<(probe: HermesRuntimeProbe) => void>();

  constructor(adapter?: HermesRuntimeAdapter) {
    this.adapter = adapter ?? new LegacyLocalRuntimeAdapter();
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
