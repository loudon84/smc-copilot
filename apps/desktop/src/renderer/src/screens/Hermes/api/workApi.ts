import type {
  CallCatalogSkillInput,
  ExpertCatalogQuery,
  ExpertCatalogSource,
  ExpertHealthResponse,
  ExpertGatewayDiagnostics,
  ExpertRunFilter,
  ExpertRuntimeEvent,
  ExpertRunEvent,
  ExpertTeamCatalogQuery,
  HermesExpert,
  HermesExpertArtifact,
  HermesExpertRun,
  HermesExpertTeam,
  ImportArtifactInput,
  RemoteArtifact,
  RemoteCatalogItem,
  RemoteExpertSkill,
  SummonExpertInput,
  SummonTeamInput,
} from "../../../../../shared/hermes-experts/hermes-experts-contract";
import type { WorkArtifact, WorkArtifactType } from "../model/artifact";
import type { WorkError, WorkErrorCode } from "../model/error";
import type { WorkExpert, WorkExpertSkill, WorkExpertStatus } from "../model/expert";
import type { WorkExpertTeam, WorkTeamMember } from "../model/expert-team";
import type { WorkRun, WorkRunDetail, WorkRunMode, WorkRunStatus, WorkRunTimelineEvent } from "../model/run";
import { workTaskApi } from "./workTaskApi";

function expertsApi(): NonNullable<typeof window.hermesExperts> {
  if (!window.hermesExperts) {
    throw new Error("window.hermesExperts is not available");
  }
  return window.hermesExperts;
}

function mapErrorCode(code?: string): WorkErrorCode {
  switch (code) {
    case "GATEWAY_OFFLINE":
    case "GATEWAY_UNHEALTHY":
    case "MCP_TOOLS_LIST_FAILED":
    case "MCP_TOOL_CALL_FAILED":
    case "MCP_INVALID_ARGUMENTS":
    case "MCP_APPROVAL_REQUIRED":
    case "MCP_GRANT_REVOKED":
    case "RUN_NOT_FOUND":
    case "RUN_TIMEOUT":
    case "ARTIFACT_NOT_FOUND":
    case "ARTIFACT_PREVIEW_FAILED":
    case "ARTIFACT_DOWNLOAD_FAILED":
    case "PERMISSION_DENIED":
      return code;
    default:
      return "UNKNOWN_ERROR";
  }
}

export function mapWorkError(input?: {
  code?: string;
  message?: string;
  errorCode?: string;
}): WorkError | undefined {
  if (!input?.message && !input?.code && !input?.errorCode) return undefined;
  const raw = input.errorCode ?? input.code ?? "UNKNOWN_ERROR";
  return {
    code: mapErrorCode(raw),
    message: input.message ?? raw,
  };
}

function mapCatalogStatus(status?: string): WorkExpertStatus {
  switch (status) {
    case "ready":
      return "ready";
    case "disabled":
      return "disabled";
    case "not_ready":
      return "offline";
    default:
      return "error";
  }
}

function mapExpertSkill(skill: RemoteExpertSkill): WorkExpertSkill {
  const outputFormat = skill.outputFormats[0];
  let format: WorkExpertSkill["outputFormat"] = "text";
  if (outputFormat === "markdown") format = "markdown";
  else if (outputFormat === "json") format = "json";
  else if (outputFormat === "file") format = "file";

  return {
    name: skill.skillName,
    displayName: skill.displayName,
    description: skill.description,
    riskLevel: skill.riskLevel,
    outputFormat: format,
    inputSchema: skill.inputSchema,
    callEnabled: skill.callEnabled,
    approvalMode: skill.approvalMode,
    outputFormats: skill.outputFormats,
  };
}

function mapExpertProvider(
  expert: HermesExpert,
): WorkExpert["provider"] {
  if (expert.executionMode === "remote_mcp" || expert.profile.profileId === "remote") {
    return "expert_mcp";
  }
  return expert.provider === "nodeskclaw" ? "nodeskclaw" : "local";
}

export function mapRemoteCatalogItem(item: RemoteCatalogItem): WorkExpert {
  return {
    id: item.slug,
    slug: item.slug,
    displayName: item.displayName,
    description: item.description,
    provider: "expert_mcp",
    category: item.category ?? "general",
    tags: item.tags,
    status: mapCatalogStatus(item.status),
    riskLevel: item.riskLevel ?? "medium",
    skillCount: item.callableSkillCount,
    availableSkills: [],
    starterPrompts: [],
  };
}

export function mapHermesExpert(expert: HermesExpert): WorkExpert {
  return {
    id: expert.expertId,
    slug: expert.catalogSlug ?? expert.expertSlug ?? expert.slug,
    displayName: expert.displayName,
    description: expert.description,
    provider: mapExpertProvider(expert),
    runtimeName: expert.runtimeName,
    category: expert.category,
    tags: expert.tags,
    status: mapCatalogStatus(expert.catalogStatus),
    riskLevel: expert.riskLevel ?? "medium",
    skillCount: expert.callableSkillCount ?? 0,
    availableSkills: [],
    starterPrompts: expert.starterPrompts.map((p) => ({
      title: p.title,
      prompt: p.prompt,
    })),
    avatar: expert.avatar,
    executionMode: expert.executionMode,
    installStatus: expert.installStatus,
    trustStatus: expert.trustStatus,
    publicSkillCount: expert.publicSkillCount,
    profileId: expert.profile.profileId,
    approvalMode: expert.approvalMode,
    outputFormats: expert.outputFormats,
    roleName: expert.identity.roleName,
    capabilities: {
      skills: expert.capabilities.skills.map((s) => ({
        skillId: s.skillId,
        name: s.name,
        version: s.version,
        required: s.required,
      })),
      mcpServers: expert.capabilities.mcpServers.map((m) => ({
        serverId: m.serverId,
        name: m.name,
      })),
      allowedTools: expert.policy.allowedTools,
    },
  };
}

export function mapHermesExpertTeam(team: HermesExpertTeam): WorkExpertTeam {
  const members: WorkTeamMember[] = team.members.map((m) => ({
    expertId: m.expertId,
    roleName: m.roleName,
    responsibility: m.responsibility,
    required: m.required,
    order: m.order,
  }));

  return {
    id: team.teamId,
    slug: team.catalogSlug ?? team.teamSlug ?? team.slug,
    displayName: team.displayName,
    description: team.description,
    orchestration: "server_managed",
    category: team.category,
    tags: team.tags ?? [],
    members,
    status: mapCatalogStatus(team.catalogStatus),
    riskLevel: team.riskLevel ?? "medium",
    starterPrompts: team.starterPrompts.map((p) => ({
      title: p.title,
      prompt: p.prompt,
    })),
    avatar: team.avatar,
    skillCount: team.callableSkillCount,
    toolName: team.toolName,
    leaderRoleName: team.leader.roleName,
    memberCount: team.memberCount ?? team.members.length + 1,
    executionMode: team.executionMode,
    installStatus: team.installStatus,
  };
}

function mapRunStatus(status: HermesExpertRun["status"]): WorkRunStatus {
  switch (status) {
    case "created":
    case "preparing":
    case "dispatching":
      return "queued";
    case "running":
    case "merging":
      return "running";
    case "waiting_approval":
      return "waiting_approval";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "failed";
  }
}

function mapRunMode(runType: HermesExpertRun["runType"]): WorkRunMode {
  return runType === "team" ? "expert_team" : "single_expert";
}

export function mapHermesRun(run: HermesExpertRun): WorkRun {
  return {
    id: run.runId,
    title: run.title,
    mode: mapRunMode(run.runType),
    expertSlug: run.catalogKind === "expert" ? run.catalogSlug : undefined,
    teamSlug: run.catalogKind === "expert_team" ? run.catalogSlug : undefined,
    skillName: run.skillName,
    status: mapRunStatus(run.status),
    prompt: run.userPrompt,
    createdAt: run.startedAt,
    updatedAt: run.completedAt ?? run.startedAt,
    completedAt: run.completedAt,
    resultPreview: run.responseText,
    artifactCount: run.artifacts?.length ?? 0,
    error: run.error
      ? mapWorkError({ code: run.error.code, message: run.error.message })
      : undefined,
  };
}

function mapTimelineEvent(event: ExpertRunEvent): WorkRunTimelineEvent {
  return {
    id: event.id,
    runId: event.runId,
    eventType: event.eventType,
    sourceProfileId: event.sourceProfileId,
    targetProfileId: event.targetProfileId,
    createdAt: event.createdAt,
    payload: event.payload,
  };
}

export function mapHermesRunDetail(
  run: HermesExpertRun,
  timeline: WorkRunTimelineEvent[] = [],
): WorkRunDetail {
  return {
    ...mapHermesRun(run),
    responseText: run.responseText,
    catalogSlug: run.catalogSlug,
    catalogKind: run.catalogKind,
    invocationId: run.invocationId,
    remoteTaskId: run.remoteTaskId,
    memberRuns: (run.memberRuns ?? []).map((m) => ({
      memberProfileId: m.memberProfileId,
      roleName: m.roleName,
      status: m.status,
      summary: m.summary,
    })),
    artifacts: (run.artifacts ?? []).map(mapHermesArtifact),
    timeline,
  };
}

function mapArtifactType(type: string): WorkArtifactType {
  if (
    type === "markdown" ||
    type === "json" ||
    type === "txt" ||
    type === "csv" ||
    type === "docx" ||
    type === "pdf" ||
    type === "file"
  ) {
    return type;
  }
  return "file";
}

export function mapRemoteArtifact(artifact: RemoteArtifact): WorkArtifact {
  return {
    id: artifact.artifactId,
    runId: artifact.taskId,
    name: artifact.name,
    type: mapArtifactType(artifact.type),
    mimeType: artifact.mimeType ?? "application/octet-stream",
    previewable: Boolean(artifact.previewUrl),
    downloadable: Boolean(artifact.downloadUrl),
    suggestedWorkspacePath: artifact.suggestedWorkspacePath,
    createdAt: artifact.createdAt ?? new Date(0).toISOString(),
  };
}

export function mapHermesArtifact(artifact: HermesExpertArtifact): WorkArtifact {
  return {
    id: artifact.id,
    runId: artifact.runId,
    name: artifact.title,
    type: mapArtifactType(artifact.artifactType),
    mimeType: artifact.mimeType ?? "application/octet-stream",
    size: artifact.sizeBytes,
    previewable: Boolean(artifact.previewText),
    downloadable: Boolean(artifact.filePath),
    createdAt: artifact.createdAt,
    previewText: artifact.previewText,
    source: artifact.source,
  };
}

export type WorkExpertListPage = {
  items: WorkExpert[];
  source: ExpertCatalogSource;
  page: number;
  pageSize: number;
  total: number;
};

export type WorkExpertTeamListPage = {
  items: WorkExpertTeam[];
  source: ExpertCatalogSource;
  page: number;
  pageSize: number;
  total: number;
};

export const workApi = {
  gateway: {
    health(): Promise<ExpertHealthResponse> {
      return expertsApi().getExpertGatewayHealth();
    },
    diagnostics(): Promise<ExpertGatewayDiagnostics> {
      return expertsApi().getExpertGatewayDiagnostics();
    },
    desktopSyncStatus() {
      return expertsApi().getDesktopSyncStatus();
    },
    clearCatalogCache() {
      return expertsApi().clearExpertCatalogCache();
    },
  },

  experts: {
    async list(query?: ExpertCatalogQuery): Promise<WorkExpert[]> {
      const page = await workApi.experts.listPage(query);
      return page.items;
    },
    async listPage(query?: ExpertCatalogQuery): Promise<WorkExpertListPage> {
      const page = await expertsApi().listExpertCatalog(query);
      return {
        items: page.items.map(mapHermesExpert),
        source: page.source ?? "remote",
        page: page.page,
        pageSize: page.pageSize,
        total: page.total,
      };
    },
    async listRawPage(query?: ExpertCatalogQuery) {
      return expertsApi().listExpertCatalog(query);
    },
    async get(expertId: string): Promise<WorkExpert | null> {
      const expert = await expertsApi().getExpert(expertId);
      return expert ? mapHermesExpert(expert) : null;
    },
    async listCatalogSkills(expertSlug: string): Promise<WorkExpertSkill[]> {
      const result = await expertsApi().listCatalogSkills(expertSlug);
      if (!result.ok || !result.data) {
        throw new Error(result.error ?? result.errorCode ?? "MCP_TOOLS_LIST_FAILED");
      }
      return result.data.map(mapExpertSkill);
    },
    summon(input: SummonExpertInput) {
      return expertsApi().summonExpert(input);
    },
    callCatalogSkill(input: CallCatalogSkillInput) {
      return expertsApi().callCatalogSkill(input);
    },
  },

  teams: {
    async list(query?: ExpertTeamCatalogQuery): Promise<WorkExpertTeam[]> {
      const page = await workApi.teams.listPage(query);
      return page.items;
    },
    async listPage(query?: ExpertTeamCatalogQuery): Promise<WorkExpertTeamListPage> {
      const page = await expertsApi().listExpertTeams(query);
      return {
        items: page.items.map(mapHermesExpertTeam),
        source: page.source ?? "remote",
        page: page.page,
        pageSize: page.pageSize,
        total: page.total,
      };
    },
    async listRawPage(query?: ExpertTeamCatalogQuery) {
      return expertsApi().listExpertTeams(query);
    },
    async get(teamId: string): Promise<WorkExpertTeam | null> {
      const team = await expertsApi().getExpertTeam(teamId);
      return team ? mapHermesExpertTeam(team) : null;
    },
    summon(input: SummonTeamInput) {
      return expertsApi().summonTeam(input);
    },
  },

  runs: {
    async listRaw(filter?: ExpertRunFilter): Promise<HermesExpertRun[]> {
      return expertsApi().listExpertRuns(filter);
    },
    async list(filter?: ExpertRunFilter): Promise<WorkRun[]> {
      const runs = await expertsApi().listExpertRuns(filter);
      return runs.map(mapHermesRun);
    },
    async get(runId: string): Promise<WorkRun | null> {
      const run = await expertsApi().getExpertRun(runId);
      return run ? mapHermesRun(run) : null;
    },
    async getDetail(runId: string): Promise<WorkRunDetail | null> {
      const run = await expertsApi().getExpertRun(runId);
      if (!run) return null;
      const timelineResult = await expertsApi().getRunTimeline(runId);
      const timeline =
        timelineResult.ok && timelineResult.data?.length
          ? timelineResult.data.map(mapTimelineEvent)
          : (run.events ?? []).map(mapTimelineEvent);
      return mapHermesRunDetail(run, timeline);
    },
    onRuntimeEvent(callback: (event: ExpertRuntimeEvent) => void) {
      return expertsApi().onExpertRuntimeEvent(callback);
    },
    getResult(runId: string) {
      return expertsApi().getRunResult(runId);
    },
    getTimeline(runId: string) {
      return expertsApi().getRunTimeline(runId);
    },
    retry(runId: string) {
      return expertsApi().retryExpertRun(runId);
    },
    cancel(runId: string) {
      return expertsApi().cancelExpertRun(runId);
    },
  },

  artifacts: {
    async listByRun(runId: string): Promise<WorkArtifact[]> {
      const result = await expertsApi().listRunArtifacts(runId);
      if (!result.ok || !result.data) return [];
      return result.data.map(mapRemoteArtifact);
    },
    async listLocal(limit?: number): Promise<WorkArtifact[]> {
      const result = await expertsApi().listLocalArtifacts(limit);
      if (!result.ok || !result.data) return [];
      return result.data.map(mapHermesArtifact);
    },
    preview(artifactId: string) {
      return expertsApi().previewRunArtifact(artifactId);
    },
    download(artifactId: string) {
      return expertsApi().downloadRunArtifact(artifactId);
    },
    import(input: ImportArtifactInput) {
      return expertsApi().importRunArtifact(input);
    },
  },

  task: {
    start: workTaskApi.startTask,
    resume: workTaskApi.resumeTask,
    list: workTaskApi.list,
    listRecent: workTaskApi.listRecentTasks,
    get: workTaskApi.get,
    getBySession: workTaskApi.getBySessionId,
    stop: workTaskApi.stop,
  },
};
