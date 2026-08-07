import type { McpErrorCode } from "./mcp-errors";

/** MCP Server transport types. */
export type McpTransport = "streamable_http" | "stdio";

export type McpServerStatus =
  | "unknown"
  | "connected"
  | "disabled"
  | "auth_failed"
  | "connect_failed"
  | "sync_failed"
  | "unhealthy";

export type McpToolStatus =
  | "available"
  | "enabled"
  | "disabled"
  | "schema_invalid"
  | "server_disabled"
  | "removed";

export type McpInvocationStatus =
  | "created"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

export type McpAuthType = "none" | "bearer" | "desktop_token";

export type McpGatewayConnectionStatus =
  | "connected"
  | "degraded"
  | "unauthorized"
  | "forbidden"
  | "offline"
  | "misconfigured";

export interface McpSyncErrorDetail {
  code: string;
  message: string;
  upstreamUrl?: string;
  localProxyUrl?: string;
  httpStatus?: number;
  responseBody?: string;
  cause?: string;
}

export interface McpSyncDiagnostics {
  backendReachable: boolean;
  localProxyReachable: boolean;
  tokenPresent: boolean;
  initialized: boolean;
  lastSyncAt: string | null;
  cacheStale?: boolean;
}

export interface McpServer {
  id: string;
  name: string;
  description: string | null;
  transport: McpTransport;
  url: string | null;
  command: string | null;
  args: string[];
  env: Record<string, string>;
  authType: McpAuthType;
  /** Reference only — token plaintext never sent to Renderer. */
  tokenRef: string | null;
  hasToken: boolean;
  enabled: boolean;
  status: McpServerStatus;
  lastError: string | null;
  lastConnectedAt: string | null;
  lastSyncedAt: string | null;
  toolsCount: number;
  profileScope: string[];
  createdAt: string;
  updatedAt: string;
}

export interface McpTool {
  id: string;
  serverId: string;
  serverName: string;
  toolName: string;
  title: string | null;
  description: string | null;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  version: string | null;
  enabled: boolean;
  sourceType: "mcp";
  category: string | null;
  visibility: "personal" | "system";
  status: McpToolStatus;
  lastSyncedAt: string | null;
}

export interface McpSkillBinding {
  id: string;
  profileName: string;
  serverId: string;
  toolId: string;
  skillId: string;
  toolName: string;
  enabled: boolean;
  invokeMode: "async" | "wait" | "artifact";
  maxWaitSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface McpInvocation {
  id: string;
  profileName: string | null;
  serverId: string;
  toolId: string;
  taskId: string | null;
  status: McpInvocationStatus;
  inputSummary: string | null;
  outputSummary: string | null;
  errorCode: McpErrorCode | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface McpArtifact {
  id: string;
  invocationId: string;
  name: string;
  mimeType: string | null;
  url: string | null;
  localPath: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export interface McpRuntimeEvent {
  type: string;
  invocationId: string;
  taskId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface McpServerStatusEvent {
  serverId: string;
  status: McpServerStatus;
  lastError: string | null;
  toolsCount: number;
}

export interface McpInvocationEvent {
  invocationId: string;
  status: McpInvocationStatus;
  taskId: string | null;
  errorCode: McpErrorCode | null;
  errorMessage: string | null;
}

export interface CreateMcpServerInput {
  id?: string;
  name: string;
  description?: string;
  transport: McpTransport;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  authType?: McpAuthType;
  /** Main-only: stored securely, never returned to Renderer. */
  bearerToken?: string;
  enabled?: boolean;
  profileScope?: string[];
}

export interface UpdateMcpServerInput {
  name?: string;
  description?: string;
  transport?: McpTransport;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  authType?: McpAuthType;
  bearerToken?: string;
  enabled?: boolean;
  profileScope?: string[];
}

export interface ListMcpToolsInput {
  profile?: string;
  serverId?: string;
  source?: "local" | "mcp" | "system" | "personal" | "all";
  search?: string;
}

export interface SetMcpToolEnabledInput {
  profileName: string;
  toolId: string;
  enabled: boolean;
  invokeMode?: "async" | "wait" | "artifact";
  maxWaitSeconds?: number;
}

export interface BindMcpToolInput {
  profileName: string;
  toolId: string;
  invokeMode?: "async" | "wait" | "artifact";
  maxWaitSeconds?: number;
}

export interface UnbindMcpToolInput {
  profileName: string;
  toolId: string;
}

export interface McpConnectionTestResult {
  ok: boolean;
  status: McpServerStatus;
  latencyMs: number | null;
  toolsPreview: number;
  errorCode: McpErrorCode | null;
  errorMessage: string | null;
}

export interface McpToolSyncResult {
  ok: boolean;
  serverId: string;
  added: number;
  updated: number;
  removed: number;
  toolsCount: number;
  status?: McpGatewayConnectionStatus;
  server?: {
    id: string;
    name: string;
    transport: McpTransport;
    upstreamUrl: string;
    localProxyUrl: string;
  };
  diagnostics?: McpSyncDiagnostics;
  error?: McpSyncErrorDetail;
}

export interface McpBridgeStatus {
  profile: string;
  installed: boolean;
  skillPath: string | null;
  proxyUrl: string;
  bindingsPath: string | null;
  gatewayRestartRecommended: boolean;
}

export interface McpInvokeToolInput {
  profileName: string;
  toolId: string;
  arguments: Record<string, unknown>;
}

export interface McpInvocationResult {
  invocationId: string;
  taskId: string | null;
  status: McpInvocationStatus;
  eventUrl: string | null;
  artifactUrl: string | null;
  result: Record<string, unknown> | null;
  errorCode: McpErrorCode | null;
  errorMessage: string | null;
}

export interface ListMcpInvocationsInput {
  profile?: string;
  serverId?: string;
  toolId?: string;
  limit?: number;
}

/** Preload surface — nested under window.hermesAPI.mcp */
export interface HermesMcpAPI {
  listServers: (profile?: string) => Promise<McpServer[]>;
  createServer: (input: CreateMcpServerInput) => Promise<McpServer>;
  updateServer: (id: string, patch: UpdateMcpServerInput) => Promise<McpServer>;
  deleteServer: (id: string) => Promise<{ success: boolean }>;
  setServerEnabled: (id: string, enabled: boolean) => Promise<McpServer>;
  testConnection: (id: string) => Promise<McpConnectionTestResult>;
  syncTools: (id: string) => Promise<McpToolSyncResult>;
  listTools: (input?: ListMcpToolsInput) => Promise<McpTool[]>;
  setToolEnabled: (input: SetMcpToolEnabledInput) => Promise<McpSkillBinding>;
  bindToolToProfile: (input: BindMcpToolInput) => Promise<McpSkillBinding>;
  unbindToolFromProfile: (input: UnbindMcpToolInput) => Promise<{ success: boolean }>;
  checkBridge: (profile: string) => Promise<McpBridgeStatus>;
  installBridge: (profile: string) => Promise<McpBridgeStatus>;
  invokeToolTest: (input: McpInvokeToolInput) => Promise<McpInvocationResult>;
  listInvocations: (input?: ListMcpInvocationsInput) => Promise<McpInvocation[]>;
  listArtifacts: (invocationId: string) => Promise<McpArtifact[]>;
  onEvent: (callback: (event: McpRuntimeEvent) => void) => () => void;
  onServerStatus: (callback: (event: McpServerStatusEvent) => void) => () => void;
  onInvocationEvent: (callback: (event: McpInvocationEvent) => void) => () => void;
}
