/**
 * Serve Instance adapter — routes Gateway lifecycle through Serve (Phase 2).
 */
import { instanceClient } from "../copilot-runtime-client/clients/instance-client";
import { getRuntimeConnectionState } from "../copilot-runtime-client/runtime-connection-manager";
import {
  isServeControlPlaneEnabled,
  isServeControlPlanePreferred,
} from "../copilot-runtime-client/runtime-mode";
import { CopilotRuntimeHttpError } from "../copilot-runtime-client/runtime-http-client";
import type {
  ServeInstanceHealth,
  ServeInstanceLogsResult,
  ServeInstanceResolveResult,
  ServeInstanceSummary,
} from "../../shared/copilot-runtime/instance-contract";

const resolveCache = new Map<string, { instanceId: string; at: number }>();
const CACHE_TTL_MS = 30_000;

function liveReady(): boolean {
  return isServeControlPlaneEnabled(getRuntimeConnectionState().ready);
}

export const ServeInstanceAdapter = {
  name: "ServeInstanceAdapter" as const,

  get ready(): boolean {
    return liveReady();
  },

  preferred(): boolean {
    return isServeControlPlanePreferred();
  },

  clearCache(): void {
    resolveCache.clear();
  },

  async resolveRef(ref: string): Promise<ServeInstanceResolveResult> {
    const key = (ref || "default").trim() || "default";
    const cached = resolveCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return { instanceId: cached.instanceId, ref: key, matchedBy: "unknown" };
    }
    const result = await instanceClient.resolve(key);
    if (result.instanceId) {
      resolveCache.set(key, { instanceId: result.instanceId, at: Date.now() });
    }
    return result;
  },

  async resolveInstanceId(ref?: string): Promise<string> {
    const result = await this.resolveRef(ref || "default");
    if (!result.instanceId) {
      throw new Error(`Unable to resolve Serve instance for ref=${ref || "default"}`);
    }
    return result.instanceId;
  },

  list(): Promise<ServeInstanceSummary[]> {
    return instanceClient.list();
  },

  get(instanceId: string): Promise<ServeInstanceSummary> {
    return instanceClient.get(instanceId);
  },

  async start(refOrId: string): Promise<{ ok: boolean; message: string | null }> {
    try {
      const instanceId = await this.resolveInstanceId(refOrId);
      await instanceClient.start(instanceId);
      return { ok: true, message: null };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  },

  async stop(refOrId: string): Promise<{ ok: boolean; message: string | null }> {
    try {
      const instanceId = await this.resolveInstanceId(refOrId);
      await instanceClient.stop(instanceId);
      return { ok: true, message: null };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  },

  async restart(refOrId: string): Promise<{ ok: boolean; message: string | null }> {
    try {
      const instanceId = await this.resolveInstanceId(refOrId);
      await instanceClient.restart(instanceId);
      return { ok: true, message: null };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  },

  health(instanceId: string): Promise<ServeInstanceHealth> {
    return instanceClient.health(instanceId);
  },

  logs(instanceId: string, options?: { tail?: number }): Promise<ServeInstanceLogsResult> {
    return instanceClient.logs(instanceId, options);
  },
};

function errorMessage(err: unknown): string {
  if (err instanceof CopilotRuntimeHttpError) return err.runtimeError.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export type ServeInstanceAdapterType = typeof ServeInstanceAdapter;
