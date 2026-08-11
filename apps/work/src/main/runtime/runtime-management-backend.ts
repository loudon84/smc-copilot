/**
 * RuntimeManagementBackend — Desktop Main facade over services/runtime HTTP API.
 */
// @lat: [[runtime-connection#Runtime Management Backend]]
import type { RuntimeClient, RuntimeJobResponse } from "@smc/runtime-client";
import type {
  HermesRuntimeConnectionResult,
  HermesRuntimeProbe,
} from "../../shared/runtime/runtime-contract";
import type { InstallProgress } from "../installer";
import { getRuntimeServiceClient } from "./runtime-service-client";
import {
  isRuntimeServiceUnavailable,
  mapRuntimeApiErrorMessage,
  mapRuntimeApiErrorToCode,
} from "./runtime-service-errors";
import {
  DEFAULT_INSTANCE_NAME,
  gatewayEndpointFromPort,
  isJobTerminal,
  mapJobEventToInstallProgress,
  mapReadinessToProbe,
  pickActiveVersion,
  resolveProfileToInstance,
  resultFromProbe,
  serviceUnavailableProbe,
  unsupportedProfileResult,
} from "./runtime-management-mapper";
import {
  RUNTIME_ERROR_CODES,
  runtimeErrorMessage,
} from "./runtime-errors";

export interface GatewayStartResult {
  success: boolean;
  running: boolean;
  error?: string;
  endpoint?: string;
}

export interface RuntimeJobHandle {
  jobId: string;
  status: string;
}

export interface RuntimeManagementBackend {
  probe(profile?: string): Promise<HermesRuntimeProbe>;
  ensureReady(profile?: string): Promise<HermesRuntimeConnectionResult>;
  restart(profile?: string): Promise<HermesRuntimeConnectionResult>;
  startGateway(profile?: string): Promise<GatewayStartResult>;
  stopGateway(profile?: string): Promise<boolean>;
  restartGateway(profile?: string): Promise<boolean>;
  gatewayStatus(profile?: string): Promise<boolean>;
  getVersion(): Promise<string | null>;
  doctor(): Promise<string>;
  update(
    onProgress?: (progress: InstallProgress) => void,
  ): Promise<RuntimeJobHandle>;
}

const HEALTH_POLL_MS = 500;
const HEALTH_TIMEOUT_MS = 60_000;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

type ResolvedInstance = {
  supported: boolean;
  profile: string;
  /** Runtime API id (UUID). Prefer this for /instances/{id}/* routes. */
  instanceId: string;
  /** Logical name (`default`). */
  instanceName: string;
  reason?: string;
};

export class HttpRuntimeManagementBackend implements RuntimeManagementBackend {
  constructor(
    private readonly getClient: () => RuntimeClient = getRuntimeServiceClient,
  ) {}

  private client(): RuntimeClient {
    return this.getClient();
  }

  /**
   * Runtime `/instances/{id}/health` expects the instance UUID, not the
   * profile/name slug. `GET .../instances/default/health` 404s even when a
   * `name=default` instance exists — resolve first.
   */
  private async resolveInstance(profile?: string): Promise<ResolvedInstance> {
    const resolved = resolveProfileToInstance(profile);
    if (!resolved.supported) {
      return {
        supported: false,
        profile: resolved.profile,
        instanceId: resolved.instanceName,
        instanceName: resolved.instanceName,
        reason: resolved.reason,
      };
    }
    try {
      const ref = (await this.client().instances.resolve(
        resolved.instanceName,
      )) as { instanceId?: string; id?: string; name?: string };
      const instanceId =
        (typeof ref.instanceId === "string" && ref.instanceId) ||
        (typeof ref.id === "string" && ref.id) ||
        "";
      if (instanceId) {
        return {
          supported: true,
          profile: resolved.profile,
          instanceId,
          instanceName: resolved.instanceName,
        };
      }
    } catch {
      /* fall through to list */
    }
    try {
      const listed = (await this.client().instances.list()) as Array<{
        id?: string;
        name?: string;
      }>;
      const hit = Array.isArray(listed)
        ? listed.find(
            (row) =>
              (row.name || "").toLowerCase() === resolved.instanceName ||
              row.id === resolved.instanceName,
          )
        : undefined;
      if (hit?.id) {
        return {
          supported: true,
          profile: resolved.profile,
          instanceId: hit.id,
          instanceName: resolved.instanceName,
        };
      }
    } catch {
      /* keep name fallback */
    }
    return {
      supported: true,
      profile: resolved.profile,
      instanceId: resolved.instanceName,
      instanceName: resolved.instanceName,
    };
  }

  async probe(profile?: string): Promise<HermesRuntimeProbe> {
    const resolved = await this.resolveInstance(profile);
    if (!resolved.supported) {
      const probe = serviceUnavailableProbe(resolved.profile);
      return {
        ...probe,
        state: "configuration_error",
        errorCode: "RUNTIME_PROFILE_UNSUPPORTED",
        errorMessage: resolved.reason,
      };
    }
    try {
      const client = this.client();
      const [status, readiness, versions] = await Promise.all([
        client.runtime.getStatus(),
        client.runtime.getReadiness(),
        client.runtime.listVersions().catch(() => []),
      ]);
      // Connection Ready follows readiness.service only (repo AGENTS.md).
      if (!readiness.service?.ready) {
        return {
          ...serviceUnavailableProbe(resolved.profile),
          homePath: status.hermesHome ?? undefined,
          version: pickActiveVersion(versions, status),
          errorMessage: "Copilot Runtime service domain is not ready.",
        };
      }
      let health: Awaited<
        ReturnType<RuntimeClient["instances"]["getHealth"]>
      > | null = null;
      try {
        health = await client.instances.getHealth(resolved.instanceId);
      } catch {
        health = null;
      }
      return mapReadinessToProbe({
        profile: resolved.profile,
        status,
        readiness,
        health,
        version: pickActiveVersion(versions, status),
      });
    } catch (err) {
      if (isRuntimeServiceUnavailable(err)) {
        return serviceUnavailableProbe(resolved.profile);
      }
      return {
        ...serviceUnavailableProbe(resolved.profile),
        state: "configuration_error",
        errorCode: mapRuntimeApiErrorToCode(err),
        errorMessage: mapRuntimeApiErrorMessage(err),
      };
    }
  }

  async ensureReady(profile?: string): Promise<HermesRuntimeConnectionResult> {
    const resolved = await this.resolveInstance(profile);
    if (!resolved.supported) {
      return unsupportedProfileResult(resolved.profile);
    }
    let initial = await this.probe(profile);
    if (initial.state === "ready") return resultFromProbe(initial);
    if (
      initial.state === "runtime_missing" ||
      initial.state === "runtime_invalid" ||
      initial.state === "configuration_error"
    ) {
      return resultFromProbe(initial);
    }
    try {
      // Ownership conflict / stale fingerprint: re-inspect before start so a
      // healthy foreign gateway can become adopted without a port fight.
      try {
        await this.client().instances.reconcile(resolved.instanceId);
        initial = await this.probe(profile);
        if (initial.state === "ready") return resultFromProbe(initial);
      } catch {
        /* reconcile is best-effort */
      }

      await this.client().instances.start(resolved.instanceId);
      const ok = await this.waitHealthy(resolved.instanceId);
      const after = await this.probe(profile);
      if (ok && after.state === "ready") return resultFromProbe(after);
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
    } catch (err) {
      // start may fail with GATEWAY_PORT_OWNERSHIP_CONFLICT while the gateway
      // is already serving — re-probe; healthy+auth still counts as ready.
      const afterConflict = await this.probe(profile).catch(() => null);
      if (afterConflict?.state === "ready") {
        return resultFromProbe(afterConflict);
      }
      return {
        ok: false,
        state: "gateway_unreachable",
        profile: resolved.profile,
        errorCode: mapRuntimeApiErrorToCode(err),
        errorMessage: mapRuntimeApiErrorMessage(err),
      };
    }
  }

  async restart(profile?: string): Promise<HermesRuntimeConnectionResult> {
    const resolved = await this.resolveInstance(profile);
    if (!resolved.supported) {
      return unsupportedProfileResult(resolved.profile);
    }
    try {
      await this.client().instances.restart(resolved.instanceId);
      const ok = await this.waitHealthy(resolved.instanceId);
      const after = await this.probe(profile);
      if (!ok) {
        return {
          ok: false,
          state: "gateway_unreachable",
          profile: after.profile,
          endpoint: after.endpoint,
          errorCode: RUNTIME_ERROR_CODES.GATEWAY_START_FAILED,
          errorMessage: runtimeErrorMessage(
            RUNTIME_ERROR_CODES.GATEWAY_START_FAILED,
          ),
        };
      }
      return resultFromProbe(after);
    } catch (err) {
      return {
        ok: false,
        state: "gateway_unreachable",
        profile: resolved.profile,
        errorCode: mapRuntimeApiErrorToCode(err),
        errorMessage: mapRuntimeApiErrorMessage(err),
      };
    }
  }

  async startGateway(profile?: string): Promise<GatewayStartResult> {
    const result = await this.ensureReady(profile);
    return {
      success: result.ok,
      running: result.ok,
      error: result.ok ? undefined : result.errorMessage,
      endpoint: result.endpoint,
    };
  }

  async stopGateway(profile?: string): Promise<boolean> {
    const resolved = await this.resolveInstance(profile);
    if (!resolved.supported) return false;
    await this.client().instances.stop(resolved.instanceId);
    return true;
  }

  async restartGateway(profile?: string): Promise<boolean> {
    const result = await this.restart(profile);
    return result.ok;
  }

  async gatewayStatus(profile?: string): Promise<boolean> {
    const probe = await this.probe(profile);
    return probe.gatewayRunning;
  }

  async getVersion(): Promise<string | null> {
    try {
      const [status, versions] = await Promise.all([
        this.client().runtime.getStatus(),
        this.client().runtime.listVersions().catch(() => []),
      ]);
      return pickActiveVersion(versions, status) ?? null;
    } catch {
      return null;
    }
  }

  async doctor(): Promise<string> {
    const accepted = await this.client().runtime.doctor();
    let job: RuntimeJobResponse | null = null;
    const logs: string[] = [];
    try {
      for await (const message of this.client().runtime.getJobEvents(
        accepted.jobId,
      )) {
        try {
          job = await this.client().runtime.getJob(accepted.jobId);
        } catch {
          /* ignore */
        }
        const progress = mapJobEventToInstallProgress(message, job);
        if (progress.log.trim()) logs.push(progress.log.trim());
        if (job && isJobTerminal(job.status)) break;
      }
    } catch (err) {
      return mapRuntimeApiErrorMessage(err);
    }
    job =
      job ??
      (await this.client().runtime.getJob(accepted.jobId).catch(() => null));
    if (job?.result && typeof job.result === "object") {
      try {
        return JSON.stringify(job.result, null, 2);
      } catch {
        /* fall through */
      }
    }
    if (logs.length > 0) return logs.join("\n");
    if (job?.errorMessage) return job.errorMessage;
    return `Doctor job ${accepted.jobId} finished with status ${job?.status ?? accepted.status}`;
  }

  async update(
    onProgress?: (progress: InstallProgress) => void,
  ): Promise<RuntimeJobHandle> {
    const accepted = await this.client().runtime.update({
      version: "latest",
      channel: "stable",
    });
    if (onProgress) {
      await this.streamJobProgress(accepted.jobId, onProgress);
    }
    return { jobId: accepted.jobId, status: accepted.status };
  }

  private async waitHealthy(instanceId: string): Promise<boolean> {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const health = await this.client().instances.getHealth(instanceId);
        if (health.gateway?.healthy === true) return true;
        if (
          (health.process?.state === "running" ||
            health.process?.state === "alive") &&
          health.gateway?.reachable === true
        ) {
          return true;
        }
      } catch {
        /* keep polling */
      }
      await sleep(HEALTH_POLL_MS);
    }
    return false;
  }

  private async streamJobProgress(
    jobId: string,
    onProgress: (progress: InstallProgress) => void,
  ): Promise<void> {
    let job: RuntimeJobResponse | null = null;
    try {
      for await (const message of this.client().runtime.getJobEvents(jobId)) {
        try {
          job = await this.client().runtime.getJob(jobId);
        } catch {
          /* ignore */
        }
        onProgress(mapJobEventToInstallProgress(message, job));
        if (job && isJobTerminal(job.status)) break;
      }
    } catch (err) {
      onProgress({
        step: 100,
        totalSteps: 100,
        title: "Update failed",
        detail: mapRuntimeApiErrorMessage(err),
        log: `${mapRuntimeApiErrorMessage(err)}\n`,
      });
      throw err;
    }
    const finalJob = await this.client().runtime.getJob(jobId).catch(() => null);
    if (finalJob && String(finalJob.status).toLowerCase() === "failed") {
      throw new Error(finalJob.errorMessage || "Runtime update job failed");
    }
  }
}

let singleton: RuntimeManagementBackend | null = null;

export function getRuntimeManagementBackend(): RuntimeManagementBackend {
  if (!singleton) singleton = new HttpRuntimeManagementBackend();
  return singleton;
}

export function setRuntimeManagementBackendForTests(
  backend: RuntimeManagementBackend | null,
): void {
  singleton = backend;
}

export { DEFAULT_INSTANCE_NAME, gatewayEndpointFromPort };
