import type { components } from "../generated/schema";
import type { RuntimeSseMessage, RuntimeTransport } from "../transport/types";

export type RuntimeStatus = components["schemas"]["RuntimeStatusResponse"];
export type RuntimeCapabilities = components["schemas"]["RuntimeCapabilitiesResponse"];
export type RuntimeInstallRequest = components["schemas"]["RuntimeInstallRequest"];
export type RuntimeJobAcceptedResponse = components["schemas"]["RuntimeJobAcceptedResponse"];
export type RuntimeJobResponse = components["schemas"]["RuntimeJobResponse"];

/** PRD v1.4 readiness v2 — may lag generated schema until contracts:generate. */
export interface RuntimeDomainReadiness {
  ready: boolean;
  checks?: Record<string, string>;
  status?: string | null;
  chatReady?: boolean | null;
  taskReady?: boolean | null;
}

export interface RuntimeReadiness {
  service: RuntimeDomainReadiness;
  execution: RuntimeDomainReadiness;
  maintenance: RuntimeDomainReadiness;
  expertMcp: RuntimeDomainReadiness;
}

export interface RuntimeVersionInfo {
  id?: string;
  version: string;
  channel?: string;
  installPath?: string;
  executablePath?: string;
  status?: string;
  installedAt?: string | null;
  activatedAt?: string | null;
}

const DEFAULT_INSTALL_BODY: RuntimeInstallRequest = {
  channel: "stable",
  createDefaultInstance: true,
  force: false,
  version: "latest",
};

export interface RuntimeDomain {
  getStatus(signal?: AbortSignal): Promise<RuntimeStatus>;
  getReadiness(signal?: AbortSignal): Promise<RuntimeReadiness>;
  getCapabilities(signal?: AbortSignal): Promise<RuntimeCapabilities>;
  getCompatibility(signal?: AbortSignal): Promise<Record<string, unknown>>;
  getHealth(signal?: AbortSignal): Promise<Record<string, unknown>>;
  install(
    body?: Partial<RuntimeInstallRequest>,
    signal?: AbortSignal,
  ): Promise<RuntimeJobAcceptedResponse>;
  update(
    body?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RuntimeJobAcceptedResponse>;
  rollback(
    body?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RuntimeJobAcceptedResponse>;
  doctor(signal?: AbortSignal): Promise<RuntimeJobAcceptedResponse>;
  getJob(jobId: string, signal?: AbortSignal): Promise<RuntimeJobResponse>;
  listJobs(signal?: AbortSignal): Promise<RuntimeJobResponse[]>;
  cancelJob(jobId: string, signal?: AbortSignal): Promise<RuntimeJobResponse>;
  getJobEvents(jobId: string, signal?: AbortSignal): AsyncIterable<RuntimeSseMessage>;
  listVersions(signal?: AbortSignal): Promise<RuntimeVersionInfo[]>;
  getVersion(version: string, signal?: AbortSignal): Promise<RuntimeVersionInfo>;
}

export function createRuntimeDomain(transport: RuntimeTransport): RuntimeDomain {
  return {
    getStatus(signal) {
      return transport.request<RuntimeStatus>({ path: "/api/v1/runtime/status", signal });
    },
    getReadiness(signal) {
      return transport.request<RuntimeReadiness>({ path: "/api/v1/runtime/readiness", signal });
    },
    getCapabilities(signal) {
      return transport.request<RuntimeCapabilities>({
        path: "/api/v1/runtime/capabilities",
        signal,
      });
    },
    getCompatibility(signal) {
      return transport.request({ path: "/api/v1/runtime/compatibility", signal });
    },
    getHealth(signal) {
      return transport.request({ path: "/api/v1/health", signal });
    },
    install(body, signal) {
      return transport.request<RuntimeJobAcceptedResponse>({
        path: "/api/v1/runtime/install",
        method: "POST",
        body: { ...DEFAULT_INSTALL_BODY, ...body },
        signal,
      });
    },
    update(body, signal) {
      return transport.request<RuntimeJobAcceptedResponse>({
        path: "/api/v1/runtime/update",
        method: "POST",
        body: body ?? { version: "latest", channel: "stable" },
        signal,
      });
    },
    rollback(body, signal) {
      return transport.request<RuntimeJobAcceptedResponse>({
        path: "/api/v1/runtime/rollback",
        method: "POST",
        body: body ?? {},
        signal,
      });
    },
    doctor(signal) {
      return transport.request<RuntimeJobAcceptedResponse>({
        path: "/api/v1/runtime/doctor",
        method: "POST",
        signal,
      });
    },
    getJob(jobId, signal) {
      return transport.request<RuntimeJobResponse>({
        path: `/api/v1/runtime/jobs/${encodeURIComponent(jobId)}`,
        signal,
      });
    },
    listJobs(signal) {
      return transport.request<RuntimeJobResponse[]>({
        path: "/api/v1/runtime/jobs",
        signal,
      });
    },
    cancelJob(jobId, signal) {
      return transport.request<RuntimeJobResponse>({
        path: `/api/v1/runtime/jobs/${encodeURIComponent(jobId)}/cancel`,
        method: "POST",
        signal,
      });
    },
    getJobEvents(jobId, signal) {
      return transport.stream({
        path: `/api/v1/runtime/jobs/${encodeURIComponent(jobId)}/events`,
        signal,
      });
    },
    listVersions(signal) {
      return transport.request<RuntimeVersionInfo[]>({
        path: "/api/v1/runtime/versions",
        signal,
      });
    },
    getVersion(version, signal) {
      return transport.request<RuntimeVersionInfo>({
        path: `/api/v1/runtime/versions/${encodeURIComponent(version)}`,
        signal,
      });
    },
  };
}
