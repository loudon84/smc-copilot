/**
 * RuntimeServiceAdapter — HermesRuntimeAdapter backed by services/runtime.
 * Non-default profiles fall back to LegacyLocalRuntimeAdapter.
 */
// @lat: [[runtime-connection#Runtime Service Adapter]]
import type {
  HermesRuntimeAdapter,
  HermesRuntimeConnectionResult,
  HermesRuntimeProbe,
} from "../../shared/runtime/runtime-contract";
import { LegacyLocalRuntimeAdapter } from "./legacy-local-runtime-adapter";
import {
  getRuntimeManagementBackend,
  type RuntimeManagementBackend,
} from "./runtime-management-backend";
import { resolveProfileToInstance } from "./runtime-management-mapper";

export class RuntimeServiceAdapter implements HermesRuntimeAdapter {
  private readonly legacy = new LegacyLocalRuntimeAdapter();

  constructor(
    private readonly backend: RuntimeManagementBackend = getRuntimeManagementBackend(),
  ) {}

  private useRuntime(profile?: string): boolean {
    return resolveProfileToInstance(profile).supported;
  }

  async probe(profile?: string): Promise<HermesRuntimeProbe> {
    if (!this.useRuntime(profile)) {
      return this.legacy.probe(profile);
    }
    return this.backend.probe(profile);
  }

  async getStatus(profile?: string): Promise<HermesRuntimeProbe> {
    return this.probe(profile);
  }

  async ensureReady(
    profile?: string,
  ): Promise<HermesRuntimeConnectionResult> {
    if (!this.useRuntime(profile)) {
      return this.legacy.ensureReady(profile);
    }
    return this.backend.ensureReady(profile);
  }

  async restart(profile?: string): Promise<HermesRuntimeConnectionResult> {
    if (!this.useRuntime(profile)) {
      return this.legacy.restart(profile);
    }
    return this.backend.restart(profile);
  }
}
