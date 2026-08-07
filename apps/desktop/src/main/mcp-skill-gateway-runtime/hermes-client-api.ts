import { dialog } from "electron";
import { writeFileSync } from "fs";
import type {
  HermesArtifactDownloadResult,
  HermesArtifactPreviewResult,
  HermesClientActionResult,
  HermesClientAgent,
  HermesClientAgentsInput,
  HermesClientBootstrap,
  HermesClientBootstrapInput,
  HermesClientTool,
  HermesClientToolsInput,
  HermesReadinessCheckInput,
  HermesReadinessCheckResult,
  HermesTaskResult,
  RecentHermesTask,
  TaskEventsTokenResult,
} from "../../shared/hermes-client/hermes-client-contract";
import {
  HermesClientError,
  isHermesClientError,
} from "../../shared/hermes-client/hermes-client-errors";
import { getDeviceIdentity } from "../genehub/device-identity";
import {
  buildHermesClientUrl,
  hermesClientFetch,
  hermesClientFetchRaw,
} from "./hermes-client-http";
import {
  mapHermesClientAgent,
  mapHermesClientAgentsList,
  mapHermesClientBootstrap,
  mapHermesClientToolsList,
  mapHermesReadinessCheckResult,
  mapHermesTaskResult,
  mapTaskEventsTokenResult,
} from "./hermes-client-mappers";
import {
  clearRecentHermesTasks,
  getRecentHermesTask,
  listRecentHermesTasks,
} from "./hermes-recent-tasks-store";

let cachedBootstrap: HermesClientBootstrap | null = null;
let cachedBootstrapAt = 0;
const BOOTSTRAP_CACHE_MS = 30_000;

function toActionResult<T>(err: unknown): HermesClientActionResult<T> {
  if (isHermesClientError(err)) {
    return { ok: false, error: err.message, errorCode: err.code };
  }
  return {
    ok: false,
    error: err instanceof Error ? err.message : String(err),
    errorCode: "HERMES_CLIENT_API_FAILED",
  };
}

function applyUrlTemplate(template: string, artifactId: string): string {
  return template.replace(/\{artifact_id\}|\{id\}/g, artifactId);
}

async function resolveArtifactAbsoluteUrl(
  artifactId: string,
  kind: "preview" | "download",
): Promise<string> {
  const url = await resolveArtifactUrl(artifactId, kind);
  if (url.startsWith("http")) return url;
  const { resolveBackendBaseUrl } = await import("./mcp-skill-gateway-config");
  const backend = resolveBackendBaseUrl();
  if (!backend) {
    throw new HermesClientError(
      "HERMES_CLIENT_BACKEND_NOT_CONFIGURED",
      "Backend URL is not configured",
    );
  }
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${backend.replace(/\/+$/, "")}${path}`;
}

async function resolveArtifactUrl(
  artifactId: string,
  kind: "preview" | "download",
): Promise<string> {
  const recent = getRecentHermesTask(artifactId);
  if (recent?.resultUrl && kind === "preview") {
    return recent.resultUrl;
  }

  const bootstrap = await getHermesClientBootstrap();
  if (!bootstrap.ok || !bootstrap.data) {
    throw new HermesClientError(
      "HERMES_CLIENT_BOOTSTRAP_FAILED",
      bootstrap.error ?? "Bootstrap unavailable",
    );
  }

  const template =
    kind === "preview"
      ? bootstrap.data.artifacts.preview_url_template
      : bootstrap.data.artifacts.download_url_template;

  if (!template) {
    throw new HermesClientError(
      "HERMES_CLIENT_ARTIFACT_PREVIEW_FAILED",
      "Artifact URL template missing from bootstrap",
    );
  }

  return applyUrlTemplate(template, artifactId);
}

export async function getHermesClientBootstrap(
  input?: HermesClientBootstrapInput,
): Promise<HermesClientActionResult<HermesClientBootstrap>> {
  try {
    const profileName = input?.profileName ?? "default";
    const cacheKey = profileName;
    if (
      cachedBootstrap &&
      cachedBootstrap.desktop.profile_name === profileName &&
      Date.now() - cachedBootstrapAt < BOOTSTRAP_CACHE_MS
    ) {
      return { ok: true, data: cachedBootstrap };
    }

    const device = getDeviceIdentity();
    const url = buildHermesClientUrl("/api/v1/hermes/client/bootstrap", {
      profile_name: profileName,
      device_id: device.deviceFingerprint,
    });
    const raw = await hermesClientFetch<Record<string, unknown>>(url);
    const mapped = mapHermesClientBootstrap(raw ?? {});
    mapped.desktop.device_id = mapped.desktop.device_id ?? device.deviceFingerprint;
    mapped.desktop.profile_name = mapped.desktop.profile_name ?? profileName;
    cachedBootstrap = mapped;
    cachedBootstrapAt = Date.now();
    return { ok: true, data: mapped };
  } catch (err) {
    return toActionResult(err);
  }
}

export function invalidateHermesClientBootstrapCache(): void {
  cachedBootstrap = null;
  cachedBootstrapAt = 0;
}

export async function listHermesClientAgents(
  input?: HermesClientAgentsInput,
): Promise<HermesClientActionResult<HermesClientAgent[]>> {
  try {
    const url = buildHermesClientUrl("/api/v1/hermes/client/agents", {
      profile_name: input?.profileName,
    });
    const raw = await hermesClientFetch<unknown>(url);
    return { ok: true, data: mapHermesClientAgentsList(raw) };
  } catch (err) {
    return toActionResult(err);
  }
}

export async function getHermesClientAgent(
  agentAlias: string,
): Promise<HermesClientActionResult<HermesClientAgent>> {
  try {
    const trimmed = agentAlias?.trim();
    if (!trimmed) {
      throw new HermesClientError(
        "HERMES_CLIENT_AGENT_ALIAS_NOT_FOUND",
        "agentAlias is required",
      );
    }
    const url = buildHermesClientUrl(
      `/api/v1/hermes/client/agents/${encodeURIComponent(trimmed)}`,
    );
    const raw = await hermesClientFetch<Record<string, unknown>>(url);
    if (!raw) {
      throw new HermesClientError(
        "HERMES_CLIENT_AGENT_ALIAS_NOT_FOUND",
        `Agent alias not found: ${trimmed}`,
      );
    }
    return { ok: true, data: mapHermesClientAgent(raw) };
  } catch (err) {
    if (err instanceof HermesClientError && err.code === "HERMES_CLIENT_API_FAILED") {
      return {
        ok: false,
        error: err.message,
        errorCode: "HERMES_CLIENT_AGENT_ALIAS_NOT_FOUND",
      };
    }
    return toActionResult(err);
  }
}

export async function listHermesClientTools(
  input?: HermesClientToolsInput,
): Promise<HermesClientActionResult<HermesClientTool[]>> {
  try {
    const url = buildHermesClientUrl("/api/v1/hermes/client/tools", {
      agent_alias: input?.agentAlias,
      profile_name: input?.profileName,
      workspace_id: input?.workspaceId,
      keyword: input?.keyword,
    });
    const raw = await hermesClientFetch<unknown>(url);
    return { ok: true, data: mapHermesClientToolsList(raw) };
  } catch (err) {
    return {
      ...toActionResult(err),
      errorCode: isHermesClientError(err)
        ? "HERMES_CLIENT_TOOLS_LIST_FAILED"
        : "HERMES_CLIENT_TOOLS_LIST_FAILED",
    };
  }
}

export async function runHermesReadinessCheck(
  input: HermesReadinessCheckInput,
): Promise<HermesClientActionResult<HermesReadinessCheckResult>> {
  try {
    if (!input.agentAlias?.trim()) {
      throw new HermesClientError("HERMES_CLIENT_READINESS_FAILED", "agentAlias is required");
    }
    const raw = await hermesClientFetch<Record<string, unknown>>(
      "/api/v1/hermes/client/readiness-check",
      {
        method: "POST",
        body: {
          agent_alias: input.agentAlias,
          tool_name: input.toolName,
          profile_name: input.profileName,
          workspace_id: input.workspaceId,
        },
      },
    );
    return { ok: true, data: mapHermesReadinessCheckResult(raw ?? {}) };
  } catch (err) {
    return {
      ...toActionResult(err),
      errorCode: "HERMES_CLIENT_READINESS_FAILED",
    };
  }
}

export async function createHermesTaskEventsToken(
  taskId: string,
): Promise<HermesClientActionResult<TaskEventsTokenResult>> {
  try {
    const trimmed = taskId?.trim();
    if (!trimmed) {
      throw new HermesClientError("HERMES_CLIENT_EVENTS_TOKEN_FAILED", "taskId is required");
    }
    const raw = await hermesClientFetch<Record<string, unknown>>(
      `/api/v1/hermes/tasks/${encodeURIComponent(trimmed)}/events-token`,
      { method: "POST", body: {} },
    );
    return { ok: true, data: mapTaskEventsTokenResult(raw ?? {}) };
  } catch (err) {
    return {
      ...toActionResult(err),
      errorCode: "HERMES_CLIENT_EVENTS_TOKEN_FAILED",
    };
  }
}

export async function getHermesTaskResult(
  taskId: string,
): Promise<HermesClientActionResult<HermesTaskResult>> {
  try {
    const trimmed = taskId?.trim();
    if (!trimmed) {
      throw new HermesClientError("HERMES_CLIENT_TASK_RESULT_FAILED", "taskId is required");
    }
    const raw = await hermesClientFetch<Record<string, unknown>>(
      `/api/v1/hermes/tasks/${encodeURIComponent(trimmed)}/result`,
    );
    return { ok: true, data: mapHermesTaskResult(raw ?? {}) };
  } catch (err) {
    return {
      ...toActionResult(err),
      errorCode: "HERMES_CLIENT_TASK_RESULT_FAILED",
    };
  }
}

export async function previewHermesArtifact(
  artifactId: string,
): Promise<HermesArtifactPreviewResult> {
  try {
    const trimmed = artifactId?.trim();
    if (!trimmed) {
      return {
        ok: false,
        error: "artifactId is required",
        errorCode: "HERMES_CLIENT_ARTIFACT_PREVIEW_FAILED",
      };
    }
    const url = await resolveArtifactAbsoluteUrl(trimmed, "preview");
    const fetched = await hermesClientFetchRaw(url, { accept: "text/*,application/json" });
    return {
      ok: true,
      contentType: fetched.contentType,
      text: fetched.text,
      base64: fetched.text ? undefined : fetched.buffer.toString("base64"),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      errorCode: isHermesClientError(err)
        ? err.code
        : "HERMES_CLIENT_ARTIFACT_PREVIEW_FAILED",
    };
  }
}

export async function downloadHermesArtifact(
  artifactId: string,
): Promise<HermesArtifactDownloadResult> {
  try {
    const trimmed = artifactId?.trim();
    if (!trimmed) {
      return {
        ok: false,
        error: "artifactId is required",
        errorCode: "HERMES_CLIENT_ARTIFACT_DOWNLOAD_FAILED",
      };
    }
    const url = await resolveArtifactAbsoluteUrl(trimmed, "download");
    const fetched = await hermesClientFetchRaw(url);
    const defaultName = trimmed.includes("/") ? trimmed.split("/").pop()! : trimmed;
    const dialogResult = await dialog.showSaveDialog({
      title: "Save artifact",
      defaultPath: defaultName,
    });
    if (dialogResult.canceled || !dialogResult.filePath) {
      return { ok: false, error: "Download cancelled" };
    }
    writeFileSync(dialogResult.filePath, fetched.buffer);
    return { ok: true, savedPath: dialogResult.filePath };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      errorCode: isHermesClientError(err)
        ? err.code
        : "HERMES_CLIENT_ARTIFACT_DOWNLOAD_FAILED",
    };
  }
}

export {
  listRecentHermesTasks,
  clearRecentHermesTasks,
  getRecentHermesTask,
};

export type { RecentHermesTask };
