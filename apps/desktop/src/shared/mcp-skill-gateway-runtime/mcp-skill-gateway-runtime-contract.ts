/** v6.4 — MCP Skill Gateway Runtime (Desktop → nodeskclaw proxy + Hermes registration). */

export type {
  DiagnosticCheck,
  DiagnosticError,
  McpGatewayDiagnosticsResult,
  McpGatewayInvokeTestInput,
  McpGatewayInvokeTestResult,
  McpGatewayOperationsErrorCode,
  McpGatewayProxyLogEntry,
  McpGatewayProxyLogLevel,
  McpGatewayApprovalMode,
  McpGatewayGrantStatus,
  McpGatewayRiskLevel,
  McpGatewayToolCategory,
  McpGatewayToolPermission,
  McpGatewayToolPreview,
} from "./mcp-gateway-operations-contract";

export {
  MCP_DIAG_TO_OP_ERROR,
  toOperationsErrorCode,
} from "./mcp-gateway-operations-contract";

export type McpSkillGatewayProxyStatus = "running" | "stopped" | "failed";

export type McpSkillGatewayDesktopErrorCode =
  | "MCP_GATEWAY_NOT_LOGGED_IN"
  | "MCP_GATEWAY_BACKEND_NOT_CONFIGURED"
  | "MCP_GATEWAY_BACKEND_MISMATCH"
  | "MCP_GATEWAY_CONFIG_MISMATCH"
  | "MCP_GATEWAY_PROXY_PORT_IN_USE"
  | "MCP_GATEWAY_PROXY_START_FAILED"
  | "MCP_GATEWAY_PROXY_NOT_RUNNING"
  | "MCP_GATEWAY_REMOTE_UNREACHABLE"
  | "MCP_GATEWAY_REMOTE_UNAUTHORIZED"
  | "MCP_GATEWAY_REMOTE_FORBIDDEN"
  | "MCP_GATEWAY_CONFIG_WRITE_FAILED"
  | "MCP_GATEWAY_PROFILE_NOT_FOUND"
  | "MCP_GATEWAY_HERMES_RESTART_REQUIRED"
  | "MCP_GATEWAY_INVALID_JSONRPC"
  | "MCP_GATEWAY_REQUEST_TOO_LARGE";

export const MCP_SKILL_GATEWAY_JSONRPC_ERRORS = {
  NOT_LOGGED_IN: -32010,
  BACKEND_NOT_CONFIGURED: -32011,
  REMOTE_FAILED: -32012,
  SESSION_EXPIRED: -32013,
} as const;

export const DEFAULT_MCP_SKILL_GATEWAY_MANAGEMENT_ROUTES = {
  skills: "/hermes/skills",
  mcp: "/hermes/mcp",
  instances: "/instances",
} as const;

export interface McpSkillGatewayRuntimeConfig {
  enabled: boolean;
  mcpEndpointPath: string;
  localProxyHost: "127.0.0.1";
  localProxyPort: number;
  autoStartProxy: boolean;
  autoRegisterToHermes: boolean;
  autoRestartHermesGateway: boolean;
  registeredProfiles: string[];
  managementRoutes: {
    skills: string;
    mcp: string;
    instances: string;
  };
  /** v6.7 — register Hermes MCP URL with ?profile= query */
  profileScopedProxyUrl?: boolean;
  /** v6.7 — show Server Authorization panel in MCP Gateway UI */
  showServerAuthorizationPanel?: boolean;
  /** v6.7 — allow write/admin invoke test from UI (default false, P0) */
  allowWriteToolInvokeTest?: boolean;
  /** v7.0 — fetch Hermes Client bootstrap on MCP Gateway page */
  enableHermesClientBootstrap?: boolean;
  /** v7.0 — filter tools preview via /hermes/client/tools */
  enableAgentAliasToolsFilter?: boolean;
  /** v7.0 — show task result panel */
  enableTaskResultPanel?: boolean;
  /** v7.0 — subscribe task events via SSE token */
  enableSseTokenEventSource?: boolean;
  updatedAt: string;
}

export const DEFAULT_MCP_SKILL_GATEWAY_CONFIG: McpSkillGatewayRuntimeConfig = {
  enabled: true,
  mcpEndpointPath: "/api/v1/hermes/mcp",
  localProxyHost: "127.0.0.1",
  localProxyPort: 48742,
  autoStartProxy: true,
  autoRegisterToHermes: true,
  autoRestartHermesGateway: false,
  registeredProfiles: ["default"],
  managementRoutes: { ...DEFAULT_MCP_SKILL_GATEWAY_MANAGEMENT_ROUTES },
  profileScopedProxyUrl: true,
  showServerAuthorizationPanel: true,
  allowWriteToolInvokeTest: false,
  enableHermesClientBootstrap: true,
  enableAgentAliasToolsFilter: true,
  enableTaskResultPanel: true,
  enableSseTokenEventSource: true,
  updatedAt: "",
};

export type McpSkillGatewayConnectionStatus =
  | "connected"
  | "degraded"
  | "unauthorized"
  | "forbidden"
  | "offline"
  | "misconfigured";

export interface McpSkillGatewayRuntimeStatus {
  enabled: boolean;
  proxyStatus: McpSkillGatewayProxyStatus;
  loggedIn: boolean;
  userDisplayName: string | null;
  backendBaseUrl: string;
  remoteMcpUrl: string;
  localProxyUrl: string;
  mcpEndpointPath: string;
  lastError: string | null;
  registeredProfileCount: number;
  hermesRestartRequired: boolean;
  gatewayStatus?: McpSkillGatewayConnectionStatus;
  gatewayName?: string;
  toolCount?: number;
  lastSyncAt?: string | null;
  cacheStale?: boolean;
  diagnostics?: {
    backendReachable: boolean;
    localProxyReachable: boolean;
    tokenPresent: boolean;
    initialized: boolean;
    lastSyncAt: string | null;
    cacheStale?: boolean;
  };
  lastStructuredError?: {
    code: string;
    message: string;
    httpStatus?: number;
    upstreamUrl?: string;
    cause?: string;
  } | null;
}

export interface McpSkillGatewayHealthResult {
  ok: boolean;
  service: string;
  status?: string;
  loggedIn: boolean;
  backendBaseUrl: string;
  remoteMcpUrl?: string;
  localMcpUrl?: string;
  target?: string;
  error?: string;
  errorCode?: McpSkillGatewayDesktopErrorCode;
}

export interface McpGatewayRemoteTestResult {
  ok: boolean;
  localProxyUrl: string;
  backendBaseUrl: string;
  remoteMcpUrl: string;
  toolCount?: number;
  jsonrpcErrorCode?: number;
  error?: string;
  errorCode?: McpSkillGatewayDesktopErrorCode;
  gatewayStatus?: McpSkillGatewayConnectionStatus;
}

export interface McpSkillGatewayActionResult {
  ok: boolean;
  error?: string;
  errorCode?: McpSkillGatewayDesktopErrorCode;
}

export interface McpSkillGatewayRegisterResult {
  ok: boolean;
  changed: boolean;
  configPath: string;
  profile: string;
  url: string;
  expectedUrl?: string;
  urlMatched?: boolean;
  backendMatched?: boolean;
  ready?: boolean;
  error?: string;
  errorCode?: McpSkillGatewayDesktopErrorCode;
  hermesRestartRequired?: boolean;
}

export interface McpSkillGatewayProfileRegistration {
  profile: string;
  configPath: string;
  registered: boolean;
  enabled: boolean;
  url: string | null;
  expectedUrl: string;
  urlMatched: boolean;
  backendMatched: boolean;
  ready: boolean;
  lastChecked: string;
}

/** v6.6 — MCP Gateway one-click diagnostics error codes (internal; map to MCP_OP_* via toOperationsErrorCode). */
export type McpGatewayDiagnosticsErrorCode =
  | "MCP_DIAG_AUTH_REQUIRED"
  | "MCP_DIAG_BACKEND_UNREACHABLE"
  | "MCP_DIAG_DESCRIPTOR_MISSING"
  | "MCP_DIAG_PROXY_NOT_RUNNING"
  | "MCP_DIAG_REMOTE_INITIALIZE_FAILED"
  | "MCP_DIAG_TOOLS_LIST_FAILED"
  | "MCP_DIAG_PROFILE_NOT_REGISTERED"
  | "MCP_DIAG_HERMES_RESTART_REQUIRED"
  | "MCP_DIAG_TOOL_CALL_FAILED";

/** @deprecated use DiagnosticCheck from mcp-gateway-operations-contract */
export type DiagnosticCheckResult = import("./mcp-gateway-operations-contract").DiagnosticCheck;

export interface McpSkillGatewayRuntimeAPI {
  getStatus(): Promise<McpSkillGatewayRuntimeStatus>;
  getConfig(): Promise<McpSkillGatewayRuntimeConfig>;
  saveConfig(
    input: Partial<McpSkillGatewayRuntimeConfig>,
  ): Promise<McpSkillGatewayRuntimeConfig>;

  startProxy(): Promise<McpSkillGatewayActionResult>;
  stopProxy(): Promise<McpSkillGatewayActionResult>;
  restartProxy(): Promise<McpSkillGatewayActionResult>;
  testProxy(): Promise<McpSkillGatewayHealthResult>;
  testRemoteMcp(): Promise<McpGatewayRemoteTestResult>;

  registerToProfile(profile: string): Promise<McpSkillGatewayRegisterResult>;
  unregisterFromProfile(profile: string): Promise<McpSkillGatewayRegisterResult>;
  listProfileRegistrations(): Promise<McpSkillGatewayProfileRegistration[]>;

  readProxyLogs(lines?: number): Promise<string>;
  readStructuredLogs(lines?: number): Promise<
    import("./mcp-gateway-operations-contract").McpGatewayProxyLogEntry[]
  >;

  runDiagnostics(): Promise<
    import("./mcp-gateway-operations-contract").McpGatewayDiagnosticsResult
  >;
  listRemoteTools(forceRefresh?: boolean): Promise<
    import("./mcp-gateway-operations-contract").McpGatewayToolPreview[]
  >;
  invokeRemoteTool(
    input: import("./mcp-gateway-operations-contract").McpGatewayInvokeTestInput,
  ): Promise<import("./mcp-gateway-operations-contract").McpGatewayInvokeTestResult>;

  getHermesClientBootstrap(
    input?: import("../hermes-client/hermes-client-contract").HermesClientBootstrapInput,
  ): Promise<import("../hermes-client/hermes-client-contract").HermesClientActionResult<
    import("../hermes-client/hermes-client-contract").HermesClientBootstrap
  >>;
  listHermesClientAgents(
    input?: import("../hermes-client/hermes-client-contract").HermesClientAgentsInput,
  ): Promise<import("../hermes-client/hermes-client-contract").HermesClientActionResult<
    import("../hermes-client/hermes-client-contract").HermesClientAgent[]
  >>;
  getHermesClientAgent(
    agentAlias: string,
  ): Promise<import("../hermes-client/hermes-client-contract").HermesClientActionResult<
    import("../hermes-client/hermes-client-contract").HermesClientAgent
  >>;
  listHermesClientTools(
    input?: import("../hermes-client/hermes-client-contract").HermesClientToolsInput,
  ): Promise<import("../hermes-client/hermes-client-contract").HermesClientActionResult<
    import("../hermes-client/hermes-client-contract").HermesClientTool[]
  >>;
  runHermesReadinessCheck(
    input: import("../hermes-client/hermes-client-contract").HermesReadinessCheckInput,
  ): Promise<import("../hermes-client/hermes-client-contract").HermesClientActionResult<
    import("../hermes-client/hermes-client-contract").HermesReadinessCheckResult
  >>;
  createHermesTaskEventsToken(
    taskId: string,
  ): Promise<import("../hermes-client/hermes-client-contract").HermesClientActionResult<
    import("../hermes-client/hermes-client-contract").TaskEventsTokenResult
  >>;
  getHermesTaskResult(
    taskId: string,
  ): Promise<import("../hermes-client/hermes-client-contract").HermesClientActionResult<
    import("../hermes-client/hermes-client-contract").HermesTaskResult
  >>;
  previewHermesArtifact(
    artifactId: string,
  ): Promise<import("../hermes-client/hermes-client-contract").HermesArtifactPreviewResult>;
  downloadHermesArtifact(
    artifactId: string,
  ): Promise<import("../hermes-client/hermes-client-contract").HermesArtifactDownloadResult>;
  getRecentHermesTasks(): Promise<
    import("../hermes-client/hermes-client-contract").RecentHermesTask[]
  >;
  clearRecentHermesTasks(): Promise<void>;
}
