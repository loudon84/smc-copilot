/** v7.0 — Hermes MCP Desktop Client Contract (nodeskclaw v4.3). */

export interface HermesClientBootstrap {
  user: {
    id: string;
    display_name: string;
  };
  org: {
    id: string;
    name: string;
  };
  desktop: {
    device_id?: string;
    profile_name?: string;
    client: "copilot-desktop";
    proxy_version?: string;
  };
  mcp: {
    server_url: string;
    health_url?: string;
    protocol_version: string;
    transport: string;
    requires_initialize: boolean;
  };
  events: {
    auth_mode: "bearer" | "bearer_or_sse_token";
    sse_token_supported: boolean;
  };
  artifacts: {
    preview_url_template: string;
    download_url_template: string;
  };
  features: Record<string, boolean>;
}

export interface HermesClientAgent {
  agent_alias: string;
  agent_id: string;
  name: string;
  description?: string;
  profile_id?: string;
  workspace_id?: string;
  profile_name?: string;
  runtime_status: string;
  accepting_tasks: boolean;
  health?: string;
  tools_count?: number;
}

export interface HermesClientTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  uiSchema?: Record<string, unknown>;
  examples?: Array<Record<string, unknown>>;
  version?: string;
  category?: string;
  agentAlias?: string;
  agentId?: string;
  profileId?: string;
  workspaceId?: string;
  approvalMode?: "none" | "server";
  requiresApproval?: boolean;
  authorized?: boolean;
  grantStatus?: string;
  primaryArtifactPolicy?: Record<string, unknown>;
}

export interface HermesReadinessCheckResult {
  ready: boolean;
  checks: Record<string, boolean>;
  routing?: {
    agent_alias?: string;
    agent_id?: string;
    profile_id?: string;
    workspace_id?: string;
    installation_id?: string;
    reason?: string;
  };
  tool?: HermesClientTool;
  errors: Array<{
    code: string;
    message: string;
  }>;
}

export interface TaskEventsTokenResult {
  event_url: string;
  expires_in: number;
  expires_at: string;
}

export interface HermesArtifactSummary {
  id: string;
  title?: string;
  file_name: string;
  artifact_type?: string;
  content_type?: string;
  preview_url?: string;
  download_url?: string;
}

export interface HermesTaskResult {
  task: {
    id: string;
    task_no?: string;
    status: string;
    tool_name?: string;
    agent_alias?: string;
    agent_id?: string;
    profile_id?: string;
    workspace_id?: string;
    created_at?: string;
    completed_at?: string;
  };
  primary_artifact?: HermesArtifactSummary | null;
  artifacts: HermesArtifactSummary[];
  timeline?: Array<Record<string, unknown>>;
  result_summary?: string;
}

export interface RecentHermesTask {
  taskId: string;
  toolName?: string;
  agentAlias?: string;
  profileName?: string;
  status?: string;
  eventUrl?: string;
  eventTokenUrl?: string;
  resultUrl?: string;
  createdAt: string;
}

export interface HermesClientBootstrapInput {
  profileName?: string;
}

export interface HermesClientAgentsInput {
  profileName?: string;
}

export interface HermesClientToolsInput {
  agentAlias?: string;
  profileName?: string;
  workspaceId?: string;
  keyword?: string;
}

export interface HermesReadinessCheckInput {
  agentAlias: string;
  toolName?: string;
  profileName?: string;
  workspaceId?: string;
}

export interface HermesArtifactPreviewResult {
  ok: boolean;
  contentType?: string;
  text?: string;
  base64?: string;
  error?: string;
  errorCode?: string;
}

export interface HermesArtifactDownloadResult {
  ok: boolean;
  savedPath?: string;
  error?: string;
  errorCode?: string;
}

export interface HermesClientActionResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}
