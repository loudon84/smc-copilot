import type {
  HermesArtifactSummary,
  HermesClientAgent,
  HermesClientBootstrap,
  HermesClientTool,
  HermesReadinessCheckResult,
  HermesTaskResult,
  TaskEventsTokenResult,
} from "../../shared/hermes-client/hermes-client-contract";

function str(raw: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return undefined;
}

function bool(raw: Record<string, unknown>, ...keys: string[]): boolean {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "boolean") return value;
  }
  return false;
}

export function mapHermesClientBootstrap(raw: Record<string, unknown>): HermesClientBootstrap {
  const user = (raw.user ?? {}) as Record<string, unknown>;
  const org = (raw.org ?? {}) as Record<string, unknown>;
  const desktop = (raw.desktop ?? {}) as Record<string, unknown>;
  const mcp = (raw.mcp ?? {}) as Record<string, unknown>;
  const events = (raw.events ?? {}) as Record<string, unknown>;
  const artifacts = (raw.artifacts ?? {}) as Record<string, unknown>;
  const features =
    raw.features && typeof raw.features === "object"
      ? (raw.features as Record<string, boolean>)
      : {};

  const authMode = str(events, "auth_mode", "authMode");
  const normalizedAuthMode =
    authMode === "bearer" || authMode === "bearer_or_sse_token"
      ? authMode
      : "bearer_or_sse_token";

  return {
    user: {
      id: str(user, "id") ?? "",
      display_name: str(user, "display_name", "displayName") ?? "",
    },
    org: {
      id: str(org, "id") ?? "",
      name: str(org, "name") ?? "",
    },
    desktop: {
      device_id: str(desktop, "device_id", "deviceId"),
      profile_name: str(desktop, "profile_name", "profileName"),
      client: "copilot-desktop",
      proxy_version: str(desktop, "proxy_version", "proxyVersion"),
    },
    mcp: {
      server_url: str(mcp, "server_url", "serverUrl") ?? "",
      health_url: str(mcp, "health_url", "healthUrl"),
      protocol_version: str(mcp, "protocol_version", "protocolVersion") ?? "2025-06-18",
      transport: str(mcp, "transport") ?? "streamable_http",
      requires_initialize: bool(mcp, "requires_initialize", "requiresInitialize"),
    },
    events: {
      auth_mode: normalizedAuthMode,
      sse_token_supported: bool(events, "sse_token_supported", "sseTokenSupported"),
    },
    artifacts: {
      preview_url_template:
        str(artifacts, "preview_url_template", "previewUrlTemplate") ?? "",
      download_url_template:
        str(artifacts, "download_url_template", "downloadUrlTemplate") ?? "",
    },
    features,
  };
}

export function mapHermesClientAgent(raw: Record<string, unknown>): HermesClientAgent {
  return {
    agent_alias: str(raw, "agent_alias", "agentAlias") ?? "",
    agent_id: str(raw, "agent_id", "agentId") ?? "",
    name: str(raw, "name") ?? "",
    description: str(raw, "description"),
    profile_id: str(raw, "profile_id", "profileId"),
    workspace_id: str(raw, "workspace_id", "workspaceId"),
    profile_name: str(raw, "profile_name", "profileName"),
    runtime_status: str(raw, "runtime_status", "runtimeStatus") ?? "unknown",
    accepting_tasks: bool(raw, "accepting_tasks", "acceptingTasks"),
    health: str(raw, "health"),
    tools_count:
      typeof raw.tools_count === "number"
        ? raw.tools_count
        : typeof raw.toolsCount === "number"
          ? raw.toolsCount
          : undefined,
  };
}

export function mapHermesClientTool(raw: Record<string, unknown>): HermesClientTool {
  const approvalMode = str(raw, "approval_mode", "approvalMode");
  return {
    name: str(raw, "name") ?? "",
    title: str(raw, "title"),
    description: str(raw, "description"),
    inputSchema:
      raw.inputSchema && typeof raw.inputSchema === "object"
        ? (raw.inputSchema as Record<string, unknown>)
        : raw.input_schema && typeof raw.input_schema === "object"
          ? (raw.input_schema as Record<string, unknown>)
          : {},
    uiSchema:
      raw.uiSchema && typeof raw.uiSchema === "object"
        ? (raw.uiSchema as Record<string, unknown>)
        : raw.ui_schema && typeof raw.ui_schema === "object"
          ? (raw.ui_schema as Record<string, unknown>)
          : undefined,
    examples: Array.isArray(raw.examples)
      ? (raw.examples as Array<Record<string, unknown>>)
      : undefined,
    version: str(raw, "version"),
    category: str(raw, "category"),
    agentAlias: str(raw, "agentAlias", "agent_alias"),
    agentId: str(raw, "agentId", "agent_id"),
    profileId: str(raw, "profileId", "profile_id"),
    workspaceId: str(raw, "workspaceId", "workspace_id"),
    approvalMode:
      approvalMode === "none" || approvalMode === "server" ? approvalMode : undefined,
    requiresApproval: bool(raw, "requires_approval", "requiresApproval") || undefined,
    authorized: typeof raw.authorized === "boolean" ? raw.authorized : undefined,
    grantStatus: str(raw, "grant_status", "grantStatus"),
    primaryArtifactPolicy:
      raw.primary_artifact_policy && typeof raw.primary_artifact_policy === "object"
        ? (raw.primary_artifact_policy as Record<string, unknown>)
        : raw.primaryArtifactPolicy && typeof raw.primaryArtifactPolicy === "object"
          ? (raw.primaryArtifactPolicy as Record<string, unknown>)
          : undefined,
  };
}

export function mapHermesReadinessCheckResult(
  raw: Record<string, unknown>,
): HermesReadinessCheckResult {
  const checks =
    raw.checks && typeof raw.checks === "object"
      ? (raw.checks as Record<string, boolean>)
      : {};
  const routing =
    raw.routing && typeof raw.routing === "object"
      ? (raw.routing as HermesReadinessCheckResult["routing"])
      : undefined;
  const toolRaw = raw.tool;
  const errorsRaw = Array.isArray(raw.errors) ? raw.errors : [];

  return {
    ready: Boolean(raw.ready),
    checks,
    routing,
    tool:
      toolRaw && typeof toolRaw === "object"
        ? mapHermesClientTool(toolRaw as Record<string, unknown>)
        : undefined,
    errors: errorsRaw.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        code: str(row, "code") ?? "UNKNOWN",
        message: str(row, "message") ?? "Check failed",
      };
    }),
  };
}

export function mapTaskEventsTokenResult(raw: Record<string, unknown>): TaskEventsTokenResult {
  return {
    event_url: str(raw, "event_url", "eventUrl") ?? "",
    expires_in:
      typeof raw.expires_in === "number"
        ? raw.expires_in
        : typeof raw.expiresIn === "number"
          ? raw.expiresIn
          : 0,
    expires_at: str(raw, "expires_at", "expiresAt") ?? "",
  };
}

export function mapHermesArtifactSummary(raw: Record<string, unknown>): HermesArtifactSummary {
  return {
    id: str(raw, "id") ?? "",
    title: str(raw, "title"),
    file_name: str(raw, "file_name", "fileName") ?? "",
    artifact_type: str(raw, "artifact_type", "artifactType"),
    content_type: str(raw, "content_type", "contentType"),
    preview_url: str(raw, "preview_url", "previewUrl"),
    download_url: str(raw, "download_url", "downloadUrl"),
  };
}

export function mapHermesTaskResult(raw: Record<string, unknown>): HermesTaskResult {
  const task = (raw.task ?? {}) as Record<string, unknown>;
  const artifactsRaw = Array.isArray(raw.artifacts) ? raw.artifacts : [];
  const primaryRaw = raw.primary_artifact ?? raw.primaryArtifact;

  return {
    task: {
      id: str(task, "id") ?? "",
      task_no: str(task, "task_no", "taskNo"),
      status: str(task, "status") ?? "unknown",
      tool_name: str(task, "tool_name", "toolName"),
      agent_alias: str(task, "agent_alias", "agentAlias"),
      agent_id: str(task, "agent_id", "agentId"),
      profile_id: str(task, "profile_id", "profileId"),
      workspace_id: str(task, "workspace_id", "workspaceId"),
      created_at: str(task, "created_at", "createdAt"),
      completed_at: str(task, "completed_at", "completedAt"),
    },
    primary_artifact:
      primaryRaw && typeof primaryRaw === "object"
        ? mapHermesArtifactSummary(primaryRaw as Record<string, unknown>)
        : null,
    artifacts: artifactsRaw.map((item) =>
      mapHermesArtifactSummary(item as Record<string, unknown>),
    ),
    timeline: Array.isArray(raw.timeline)
      ? (raw.timeline as Array<Record<string, unknown>>)
      : undefined,
    result_summary: str(raw, "result_summary", "resultSummary"),
  };
}

export function mapHermesClientAgentsList(raw: unknown): HermesClientAgent[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => mapHermesClientAgent(item as Record<string, unknown>));
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const list = obj.agents ?? obj.items ?? obj.data;
    if (Array.isArray(list)) {
      return list.map((item) => mapHermesClientAgent(item as Record<string, unknown>));
    }
  }
  return [];
}

export function mapHermesClientToolsList(raw: unknown): HermesClientTool[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => mapHermesClientTool(item as Record<string, unknown>));
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const list = obj.tools ?? obj.items ?? obj.data;
    if (Array.isArray(list)) {
      return list.map((item) => mapHermesClientTool(item as Record<string, unknown>));
    }
  }
  return [];
}
