/** Hermes Experts Workspace — shared contract (v7.2 remote pivot + Expert MCP Gateway v6.1 + v7.5 stream). */

import type {
  ExpertArtifact,
  ExpertArtifactDownloadInput,
  ExpertArtifactDownloadResult,
  ExpertArtifactPreview,
  ExpertArtifactPreviewInput,
  ExpertTaskEvent,
  ExpertTaskStreamClosedEvent,
  ExpertTaskStreamError,
  OpenAICompatibleExpertPayload,
  SubscribeExpertTaskEventsInput,
  SubscribeExpertTaskEventsResult,
} from "./expert-task-stream-contract";

export type {
  ExpertArtifact,
  ExpertArtifactDownloadInput,
  ExpertArtifactDownloadResult,
  ExpertArtifactPreview,
  ExpertArtifactPreviewInput,
  ExpertTaskEvent,
  ExpertTaskStreamClosedEvent,
  ExpertTaskStreamError,
  OpenAICompatibleExpertPayload,
  SubscribeExpertTaskEventsInput,
  SubscribeExpertTaskEventsResult,
} from "./expert-task-stream-contract";

// --- Expert MCP Gateway v6.1 JSON-RPC & catalog types ---

export interface JsonRpcRequest<TParams = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: TParams;
}

export interface JsonRpcSuccess<TResult = unknown> {
  jsonrpc: "2.0";
  id: string | number | null;
  result: TResult;
}

export interface JsonRpcErrorPayload {
  code: number;
  message: string;
  data?: {
    errorCode?: string;
    [key: string]: unknown;
  };
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: JsonRpcErrorPayload;
}

export type JsonRpcResponse<TResult = unknown> = JsonRpcSuccess<TResult> | JsonRpcError;

export type ExpertCatalogKind = "expert" | "expert_team";
export type ExpertSkillKind = "expert_skill" | "expert_team_skill";
export type ExpertCatalogStatus = "ready" | "not_ready" | "disabled" | "unknown";

export interface McpToolDescriptor<TAnnotations = Record<string, unknown>> {
  name: string;
  description?: string;
  title?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: TAnnotations;
}

export interface ExpertCatalogAnnotations {
  kind: ExpertCatalogKind;
  slug: string;
  displayName: string;
  category?: string;
  tags?: string[];
  status?: ExpertCatalogStatus;
  publicSkillCount?: number;
  callableSkillCount?: number;
  orchestrationMode?: "upstream_skill" | "gateway_sequential" | "gateway_parallel_reserved";
  riskLevel?: "low" | "medium" | "high";
  approvalMode?: "none" | "server" | "admin";
}

export interface ExpertSkillAnnotations {
  kind: ExpertSkillKind;
  slug: string;
  displayName: string;
  callEnabled: boolean;
  riskLevel?: "low" | "medium" | "high";
  approvalMode?: "none" | "server" | "admin";
  outputFormats?: string[];
  orchestrationMode?: "upstream_skill" | "gateway_sequential" | "gateway_parallel_reserved";
}

export interface ToolsListResult<TAnnotations = Record<string, unknown>> {
  tools: Array<McpToolDescriptor<TAnnotations>>;
}

export type ExpertCatalogTool = McpToolDescriptor<ExpertCatalogAnnotations>;
export type ExpertSkillTool = McpToolDescriptor<ExpertSkillAnnotations>;

export interface RemoteCatalogItem {
  slug: string;
  kind: ExpertCatalogKind;
  displayName: string;
  description: string;
  category?: string;
  tags: string[];
  status: ExpertCatalogStatus;
  publicSkillCount: number;
  callableSkillCount: number;
  remoteToolName: string;
  orchestrationMode?: string;
  riskLevel?: "low" | "medium" | "high";
  approvalMode?: "none" | "server" | "admin";
}

export interface RemoteExpertSkill {
  slug: string;
  skillName: string;
  kind: ExpertSkillKind;
  displayName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  callEnabled: boolean;
  riskLevel: "low" | "medium" | "high";
  approvalMode: "none" | "server" | "admin";
  outputFormats: string[];
  orchestrationMode?: string;
}

export interface ExpertCallArguments {
  prompt: string;
  context?: {
    source?: "copilot-desktop";
    conversationId?: string;
    workspaceId?: string;
    deviceId?: string;
    screenContext?: Record<string, unknown>;
    webContext?: Record<string, unknown>;
    files?: Array<{
      name: string;
      path?: string;
      mimeType?: string;
      size?: number;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ToolsCallParams {
  name: string;
  arguments: ExpertCallArguments;
}

export interface McpTextContent {
  type: "text";
  text: string;
}

export interface McpJsonContent {
  type: "json";
  json: unknown;
}

export type McpContent = McpTextContent | McpJsonContent;

export interface ExpertCallStructuredContent {
  invocationId?: string;
  slug: string;
  kind: ExpertCatalogKind;
  skillName: string;
  orchestrationMode?: "upstream_skill" | "gateway_sequential" | "gateway_parallel_reserved";
  status: "completed" | "failed" | "rejected" | "timeout";
  [key: string]: unknown;
}

export interface ToolsCallResult {
  content: McpContent[];
  structuredContent?: ExpertCallStructuredContent;
}

export interface ExpertHealthResponse {
  ok: boolean;
  status: string;
  version?: string;
  message?: string;
  gateway?: {
    name?: string;
    version?: string;
  };
  publishedExperts?: number;
  publishedExpertTeams?: number;
  publicSkills?: number;
  callableSkills?: number;
  runtimeReady?: boolean;
}

export type ExpertCatalogSource = "remote" | "cache" | "mock" | "legacy_rest_fallback";

export type ExpertGatewayDiagnostics = {
  ok: boolean;
  backendBaseUrl: string;
  expertHealthUrl: string;
  expertMcpRootUrl: string;
  currentCatalogSource?: ExpertCatalogSource;
  lastError?: string;
  catalogCacheVersion?: string;
};

export type CallCatalogSkillInput = {
  slug: string;
  catalogKind: ExpertCatalogKind;
  skillName: string;
  /** Legacy prompt path — ignored when `payload` is provided. */
  prompt?: string;
  context?: Record<string, unknown>;
  sessionId?: string;
  /** v7.5 OpenAI-compatible Chat Completion arguments for tools/call. */
  payload?: OpenAICompatibleExpertPayload;
};

export type CallCatalogSkillResult = {
  ok: boolean;
  runId?: string;
  responseText?: string;
  structuredContent?: ExpertCallStructuredContent;
  errorCode?: string;
  message?: string;
  /** v7.5 event_stream accepted result fields */
  mode?: "event_stream" | "sync_result";
  taskId?: string;
  taskNo?: string;
  eventSseUrl?: string;
  artifactUrl?: string;
  status?: "accepted" | "queued" | "running";
  streaming?: boolean;
};

/** @deprecated Use RemoteExpertSkill — kept for backward compatibility. */
export type ExpertMcpSkill = {
  skillName: string;
  displayName: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  riskLevel?: "low" | "medium" | "high";
  approvalMode?: "none" | "server" | "desktop" | "hybrid";
  callEnabled?: boolean;
};

export type ExpertMcpCallResult = {
  ok: boolean;
  contentText?: string;
  durationMs?: number;
  errorCode?: string;
  message?: string;
  approvalRequired?: boolean;
  invocationType?: "expert_skill" | "expert_team";
};

/** @deprecated Use ExpertHealthResponse — kept for backward compatibility. */
export type ExpertGatewayHealth = ExpertHealthResponse;

export type RemoteExpertExecutionMode = "remote_mcp";

export type RemoteRunContext = {
  source?: string;
  device_id?: string;
  workspace_id?: string;
  conversation_id?: string;
  client_version?: string;
  page_url?: string;
  screen_summary?: string;
  attachments?: Array<{ name: string; ref: string }>;
};

export type RemoteArtifactKbStatus =
  | "none"
  | "pending_review"
  | "approved"
  | "indexing"
  | "indexed"
  | "rejected";

export type RemoteArtifact = {
  artifactId: string;
  taskId: string;
  name: string;
  type: "markdown" | "json" | "txt" | "csv" | "docx" | "pdf" | "file";
  mimeType?: string;
  source: "materialized" | "discovery" | "server_artifact";
  previewUrl?: string;
  downloadUrl?: string;
  suggestedWorkspacePath?: string;
  kbStatus?: RemoteArtifactKbStatus;
  createdAt?: string;
};

export type RemoteRunResult = {
  taskId: string;
  status: string;
  resultSummary?: string;
  artifacts: RemoteArtifact[];
  timeline: ExpertRunEvent[];
};

export type ImportArtifactInput = {
  artifactId: string;
  taskId: string;
  targetDir?: string;
};

export type ImportArtifactResult = {
  ok: boolean;
  localPath?: string;
  errorCode?: string;
  message?: string;
};

export type GeneHubSkillSubmission = {
  submissionId: string;
  skillName: string;
  status: "draft" | "submitted" | "reviewing" | "approved" | "published" | "rejected";
  submittedAt?: string;
  reviewedAt?: string;
  message?: string;
};

export type GeneHubPullJob = {
  jobId: string;
  skillName: string;
  targetRuntime?: string;
  status: string;
  createdAt?: string;
  completedAt?: string;
};

export type PushSkillInput = {
  skillPath: string;
  name: string;
  version?: string;
  description?: string;
};

export type HermesExpertInstallStatus =
  | "not_installed"
  | "installing"
  | "installed"
  | "update_available"
  | "failed";

export type HermesExpertTrustStatus = "untrusted" | "trusted" | "disabled" | "blocked";

export type HermesExpertTeamInstallStatus =
  | "not_installed"
  | "partial_installed"
  | "installed"
  | "update_available"
  | "failed";

export type HermesTeamOrchestrationMode =
  | "leader_dispatch"
  | "parallel_then_merge"
  | "sequential_pipeline";

export type HermesTeamMergeStrategy =
  | "leader_summary"
  | "structured_report"
  | "vote_then_summary";

export type HermesExpertRunType = "single_expert" | "team";

export type HermesExpertRunStatus =
  | "created"
  | "preparing"
  | "dispatching"
  | "running"
  | "waiting_approval"
  | "merging"
  | "completed"
  | "failed"
  | "cancelled";

export type HermesWorkMode = "ask" | "plan" | "craft";

export type HermesExpertArtifactType =
  | "markdown"
  | "docx"
  | "pdf"
  | "xlsx"
  | "html"
  | "json"
  | "image"
  | "file";

export type HermesStarterPrompt = {
  title: string;
  prompt: string;
};

export type HermesExpertSkillBinding = {
  skillId: string;
  name: string;
  version: string;
  required: boolean;
  source: "nodeskclaw" | "local" | "bundled";
};

export type HermesExpertMcpBinding = {
  serverId: string;
  name: string;
  transport: string;
  url?: string;
  profileScoped?: boolean;
  required: boolean;
  trustRequired?: boolean;
};

export type HermesExpertToolsetBinding = {
  key: string;
  enabled: boolean;
};

export type HermesExpertPolicy = {
  allowedTools: string[];
  deniedTools?: string[];
  requireApproval?: string[];
  allowedDomains?: string[];
  delegationTargets?: string[];
};

export type HermesExpert = {
  expertId: string;
  slug: string;
  /** Backend expert_slug for Expert MCP Gateway `/expert/mcp/{slug}`. */
  expertSlug?: string;
  name: string;
  displayName: string;
  category: string;
  description: string;
  avatar?: string;
  provider: "nodeskclaw" | "local";
  version: string;
  tags: string[];
  domains: string[];
  /** MCP tool name for remote summon (V7.2). */
  toolName?: string;
  inputSchema?: Record<string, unknown>;
  riskLevel?: "low" | "medium" | "high";
  approvalMode?: "none" | "server" | "desktop" | "hybrid";
  authorized?: boolean;
  artifactMode?: "pull_only";
  outputFormats?: string[];
  sourceType?: "hermes_api_server" | "registry" | "genehub";
  runtimeName?: string;
  enabled?: boolean;
  executionMode?: RemoteExpertExecutionMode;
  sortOrder?: number;
  catalogSlug?: string;
  catalogKind?: "expert";
  remoteToolName?: string;
  publicSkillCount?: number;
  callableSkillCount?: number;
  catalogStatus?: ExpertCatalogStatus;
  profile: {
    profileId: string;
    runtimeType: "hermes-local";
    port?: number;
    modelPolicy?: {
      defaultModelId?: string;
      allowedModelIds?: string[];
    };
  };
  identity: {
    roleName: string;
    soulMd: string;
    userMd?: string;
    systemRules?: string[];
  };
  capabilities: {
    skills: HermesExpertSkillBinding[];
    mcpServers: HermesExpertMcpBinding[];
    toolsets: HermesExpertToolsetBinding[];
  };
  memory: {
    mode: "isolated" | "workspace_shared" | "temporary";
    seedMemoryMd?: string;
  };
  policy: HermesExpertPolicy;
  starterPrompts: HermesStarterPrompt[];
  installStatus: HermesExpertInstallStatus;
  trustStatus: HermesExpertTrustStatus;
};

export type HermesExpertTeam = {
  teamId: string;
  slug: string;
  /** Backend team_slug for Expert MCP Gateway `/expert/mcp/{slug}`. */
  teamSlug?: string;
  name: string;
  displayName: string;
  category: string;
  description: string;
  avatar?: string;
  version: string;
  toolName?: string;
  orchestrationMode?:
    | "server_managed"
    | "upstream_skill"
    | "gateway_sequential"
    | "gateway_parallel_reserved";
  catalogSlug?: string;
  catalogKind?: "expert_team";
  remoteToolName?: string;
  publicSkillCount?: number;
  callableSkillCount?: number;
  catalogStatus?: ExpertCatalogStatus;
  riskLevel?: "low" | "medium" | "high";
  approvalMode?: "none" | "server" | "desktop" | "hybrid";
  artifactMode?: "pull_only";
  outputFormats?: string[];
  executionMode?: RemoteExpertExecutionMode;
  leader: { expertId: string; roleName: string };
  members: Array<{
    expertId: string;
    roleName: string;
    responsibility: string;
    required: boolean;
    order: number;
  }>;
  orchestration: {
    mode: HermesTeamOrchestrationMode;
    mergeStrategy: HermesTeamMergeStrategy;
    maxRounds: number;
  };
  starterPrompts: HermesStarterPrompt[];
  installStatus: HermesExpertTeamInstallStatus;
  memberCount?: number;
  tags?: string[];
};

export type HermesExpertArtifact = {
  id: string;
  runId: string;
  profileId?: string;
  title: string;
  artifactType: HermesExpertArtifactType;
  filePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  previewText?: string;
  source: string;
  createdAt: string;
};

export type HermesExpertMemberRun = {
  memberProfileId: string;
  roleName: string;
  status: "pending" | "running" | "succeeded" | "failed" | "timeout";
  summary?: string;
  error?: { code: string; message: string };
};

export type HermesExpertRun = {
  runId: string;
  runType: HermesExpertRunType;
  expertId?: string;
  teamId?: string;
  /** @deprecated HermesTask id — not used on Expert MCP Gateway v6 synchronous path. */
  remoteTaskId?: string;
  activeProfileId: string;
  sessionId?: string;
  title: string;
  userPrompt: string;
  /** Synchronous MCP response text (maps from result_summary). */
  responseText?: string;
  catalogSlug?: string;
  catalogKind?: ExpertCatalogKind;
  skillName?: string;
  structuredContentJson?: string;
  invocationId?: string;
  executionMode?: RemoteExpertExecutionMode;
  status: HermesExpertRunStatus;
  startedAt: string;
  completedAt?: string;
  memberRuns?: HermesExpertMemberRun[];
  artifacts?: HermesExpertArtifact[];
  events?: ExpertRunEvent[];
  error?: { code: string; message: string };
};

export type ExpertRunEvent = {
  id: string;
  runId: string;
  eventType: string;
  sourceProfileId?: string;
  targetProfileId?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
};

export type ExpertRiskReport = {
  riskLevel: "P0" | "P1" | "P2" | "P3";
  warnings: string[];
  permissions: string[];
  localFileAccess?: string[];
  networkAccess?: string[];
  mcpServers?: string[];
  toolsets?: string[];
  requiresUserApproval?: boolean;
};

export type ExpertInstallPlanFile = {
  path: string;
  content: string;
  mergePolicy: "replace" | "skip_if_exists" | "append";
};

export type ExpertInstallPlanProfile = {
  profileId: string;
  displayName: string;
  port: number;
  files: ExpertInstallPlanFile[];
};

export type ExpertInstallPlan = {
  planId: string;
  target: { kind: "expert" | "expert_team"; id: string; version: string };
  profiles: ExpertInstallPlanProfile[];
  skills: Array<{
    skillId: string;
    name: string;
    version: string;
    installSource: string;
    required: boolean;
    checksum?: string;
  }>;
  mcpServers: Array<{
    serverId: string;
    name: string;
    url: string;
    transport: string;
    authRef?: string;
    trustRequired?: boolean;
  }>;
  riskReport: ExpertRiskReport;
};

export type ExpertCatalogQuery = {
  category?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
};

export type ExpertTeamCatalogQuery = ExpertCatalogQuery;

export type ExpertCatalogPage = {
  items: HermesExpert[];
  page: number;
  pageSize: number;
  total: number;
  source?: ExpertCatalogSource;
};

export type ExpertTeamCatalogPage = {
  items: HermesExpertTeam[];
  page: number;
  pageSize: number;
  total: number;
  source?: ExpertCatalogSource;
};

export type ExpertRunFilter = {
  status?: HermesExpertRunStatus | "all";
  runType?: HermesExpertRunType;
  limit?: number;
};

export type InstallOptions = {
  overwrite?: boolean;
  installSkills?: boolean;
  registerMcp?: boolean;
};

export type SummonExpertInput = {
  expertId: string;
  userPrompt?: string;
  slug?: string;
  skillName?: string;
  sessionId?: string;
  context?: RemoteRunContext;
};

export type SummonTeamInput = {
  teamId: string;
  userPrompt?: string;
  slug?: string;
  skillName?: string;
  sessionId?: string;
  context?: RemoteRunContext;
};

export type SummonExpertResult = {
  ok: boolean;
  expertId?: string;
  profileId?: string;
  runId?: string;
  taskId?: string;
  sessionId?: string;
  runtimeStatus?: "running" | "starting" | "failed";
  message?: string;
  errorCode?: string;
  approvalRequired?: boolean;
};

export type SummonTeamResult = SummonExpertResult & {
  teamId?: string;
  leaderProfileId?: string;
};

export type ExpertRuntimeEvent = {
  type: "run_updated" | "run_event" | "artifact_created";
  runId: string;
  payload: Record<string, unknown>;
};

export type ExpertDesktopSyncStatus = {
  registered: boolean;
  desktopId?: string;
  lastHeartbeatAt?: string;
  lastError?: string;
  lastRegisterAt?: string;
};

export type ExpertPreflightResult = {
  ok: boolean;
  errorCode?: string;
  message?: string;
  warnings?: string[];
};

export type HermesExpertsActionResult<T = void> = {
  ok: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
};

export interface HermesExpertsAPI {
  listExpertCatalog: (input?: ExpertCatalogQuery) => Promise<ExpertCatalogPage>;
  getExpert: (expertId: string) => Promise<HermesExpert | null>;
  listExpertTeams: (input?: ExpertTeamCatalogQuery) => Promise<ExpertTeamCatalogPage>;
  getExpertTeam: (teamId: string) => Promise<HermesExpertTeam | null>;
  getExpertGatewayHealth: () => Promise<ExpertHealthResponse>;
  getExpertGatewayDiagnostics: () => Promise<ExpertGatewayDiagnostics>;
  clearExpertCatalogCache: () => Promise<{ ok: true }>;
  listCatalogSkills: (slug: string) => Promise<HermesExpertsActionResult<RemoteExpertSkill[]>>;
  listExpertSkills: (expertSlug: string) => Promise<HermesExpertsActionResult<RemoteExpertSkill[]>>;
  callCatalogSkill: (input: CallCatalogSkillInput) => Promise<CallCatalogSkillResult>;
  listLocalArtifacts: (limit?: number) => Promise<HermesExpertsActionResult<HermesExpertArtifact[]>>;
  /** @deprecated V7.2 — remote experts do not install local Profile. */
  previewInstallExpert: (expertId: string) => Promise<HermesExpertsActionResult<ExpertInstallPlan>>;
  /** @deprecated V7.2 — remote experts do not install local Profile. */
  installExpert: (
    expertId: string,
    options?: InstallOptions,
  ) => Promise<HermesExpertsActionResult<{ profileId: string }>>;
  /** @deprecated V7.2 — remote teams do not install local Profile. */
  previewInstallTeam: (teamId: string) => Promise<HermesExpertsActionResult<ExpertInstallPlan>>;
  /** @deprecated V7.2 — remote teams do not install local Profile. */
  installTeam: (
    teamId: string,
    options?: InstallOptions,
  ) => Promise<HermesExpertsActionResult<{ profileIds: string[] }>>;
  summonExpert: (input: SummonExpertInput) => Promise<SummonExpertResult>;
  summonTeam: (input: SummonTeamInput) => Promise<SummonTeamResult>;
  listExpertRuns: (filter?: ExpertRunFilter) => Promise<HermesExpertRun[]>;
  getExpertRun: (runId: string) => Promise<HermesExpertRun | null>;
  syncRemoteRun: (runId: string) => Promise<HermesExpertsActionResult>;
  getRunResult: (runId: string) => Promise<HermesExpertsActionResult<RemoteRunResult>>;
  getRunTimeline: (runId: string) => Promise<HermesExpertsActionResult<ExpertRunEvent[]>>;
  listRunArtifacts: (runId: string) => Promise<HermesExpertsActionResult<RemoteArtifact[]>>;
  previewRunArtifact: (artifactId: string) => Promise<HermesExpertsActionResult<{ text?: string; contentType?: string }>>;
  downloadRunArtifact: (artifactId: string) => Promise<HermesExpertsActionResult<{ savedPath?: string }>>;
  importRunArtifact: (input: ImportArtifactInput) => Promise<ImportArtifactResult>;
  cancelExpertRun: (runId: string) => Promise<HermesExpertsActionResult>;
  retryExpertRun: (runId: string) => Promise<HermesExpertsActionResult<SummonExpertResult | SummonTeamResult>>;
  setExpertTrust: (
    expertId: string,
    trustStatus: HermesExpertTrustStatus,
  ) => Promise<HermesExpertsActionResult>;
  /** @deprecated V7.2 — local Profile preflight not used for remote experts. */
  preflightExpert: (
    profileId: string,
    port?: number,
  ) => Promise<ExpertPreflightResult>;
  /** @deprecated V7.2 — team orchestration is server_managed. */
  dispatchTeam: (input: {
    runId: string;
    teamId: string;
    leaderProfileId: string;
    userPrompt: string;
  }) => Promise<HermesExpertsActionResult>;
  pushGeneHubSkill: (input: PushSkillInput) => Promise<HermesExpertsActionResult<{ submissionId?: string }>>;
  listGeneHubSubmissions: () => Promise<HermesExpertsActionResult<GeneHubSkillSubmission[]>>;
  listGeneHubPullJobs: () => Promise<HermesExpertsActionResult<GeneHubPullJob[]>>;
  getDesktopSyncStatus: () => Promise<HermesExpertsActionResult<ExpertDesktopSyncStatus>>;
  registerDesktop: () => Promise<HermesExpertsActionResult<ExpertDesktopSyncStatus>>;
  onExpertRuntimeEvent: (callback: (event: ExpertRuntimeEvent) => void) => () => void;
  subscribeExpertTaskEvents: (
    input: SubscribeExpertTaskEventsInput,
  ) => Promise<SubscribeExpertTaskEventsResult>;
  unsubscribeExpertTaskEvents: (taskId: string) => Promise<void>;
  onExpertTaskEvent: (callback: (event: ExpertTaskEvent) => void) => () => void;
  onExpertTaskStreamError: (callback: (error: ExpertTaskStreamError) => void) => () => void;
  onExpertTaskStreamClosed: (
    callback: (event: ExpertTaskStreamClosedEvent) => void,
  ) => () => void;
  listExpertTaskArtifacts: (taskId: string) => Promise<HermesExpertsActionResult<ExpertArtifact[]>>;
  previewExpertArtifact: (
    input: ExpertArtifactPreviewInput,
  ) => Promise<HermesExpertsActionResult<ExpertArtifactPreview>>;
  downloadExpertArtifact: (
    input: ExpertArtifactDownloadInput,
  ) => Promise<ExpertArtifactDownloadResult>;
}
