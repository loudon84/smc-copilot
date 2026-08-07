import type {
  ExpertCatalogAnnotations,
  ExpertCatalogStatus,
  ExpertSkillAnnotations,
  HermesExpert,
  HermesExpertTeam,
  JsonRpcErrorPayload,
  McpToolDescriptor,
  RemoteCatalogItem,
  RemoteExpertSkill,
  ToolsCallResult,
} from "../../shared/hermes-experts/hermes-experts-contract";
import { HermesExpertsError } from "../../shared/hermes-experts/hermes-experts-errors";

export type ExpertMcpToolDescriptor = McpToolDescriptor<Record<string, unknown>>;

function readAnnotations(tool: ExpertMcpToolDescriptor): Record<string, unknown> {
  return (tool.annotations ?? {}) as Record<string, unknown>;
}

function mapRiskLevel(value: unknown): "low" | "medium" | "high" {
  if (value === "low" || value === "medium" || value === "high") return value;
  return "medium";
}

function mapApprovalMode(value: unknown): "none" | "server" | "admin" {
  if (value === "none" || value === "server" || value === "admin") return value;
  return "server";
}

function mapCatalogStatus(value: unknown): ExpertCatalogStatus {
  if (value === "ready" || value === "not_ready" || value === "disabled" || value === "unknown") {
    return value;
  }
  return "unknown";
}

function readNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function mapCatalogTool(tool: ExpertMcpToolDescriptor): RemoteCatalogItem | null {
  const ann = readAnnotations(tool) as Partial<ExpertCatalogAnnotations> & Record<string, unknown>;
  const kind = String(ann.kind ?? "");
  if (kind !== "expert" && kind !== "expert_team") return null;

  const slug = String(
    ann.slug ?? ann.expert_slug ?? ann.expertSlug ?? ann.team_slug ?? ann.teamSlug ?? tool.name,
  );
  const displayName = String(ann.displayName ?? ann.display_name ?? tool.title ?? slug);

  return {
    slug,
    kind,
    displayName,
    description: tool.description ?? "",
    category: ann.category ? String(ann.category) : undefined,
    tags: Array.isArray(ann.tags) ? (ann.tags as string[]) : [],
    status: mapCatalogStatus(ann.status),
    publicSkillCount: readNumber(ann.publicSkillCount ?? ann.public_skill_count),
    callableSkillCount: readNumber(ann.callableSkillCount ?? ann.callable_skill_count),
    remoteToolName: tool.name,
    orchestrationMode: ann.orchestrationMode
      ? String(ann.orchestrationMode)
      : ann.orchestration_mode
        ? String(ann.orchestration_mode)
        : undefined,
    riskLevel: mapRiskLevel(ann.riskLevel ?? ann.risk_level),
    approvalMode: mapApprovalMode(ann.approvalMode ?? ann.approval_mode),
  };
}

export function mapSkillTool(tool: ExpertMcpToolDescriptor): RemoteExpertSkill | null {
  const ann = readAnnotations(tool) as Partial<ExpertSkillAnnotations> & Record<string, unknown>;
  const kind = String(ann.kind ?? "");
  if (kind !== "expert_skill" && kind !== "expert_team_skill") return null;

  const slug = String(ann.slug ?? tool.name);
  const skillName = tool.name;

  return {
    slug,
    skillName,
    kind,
    displayName: String(ann.displayName ?? ann.display_name ?? tool.title ?? skillName),
    description: tool.description ?? "",
    inputSchema: tool.inputSchema ?? {},
    callEnabled: ann.callEnabled !== false && ann.call_enabled !== false,
    riskLevel: mapRiskLevel(ann.riskLevel ?? ann.risk_level),
    approvalMode: mapApprovalMode(ann.approvalMode ?? ann.approval_mode),
    outputFormats: Array.isArray(ann.outputFormats)
      ? (ann.outputFormats as string[])
      : Array.isArray(ann.output_formats)
        ? (ann.output_formats as string[])
        : [],
    orchestrationMode: ann.orchestrationMode
      ? String(ann.orchestrationMode)
      : ann.orchestration_mode
        ? String(ann.orchestration_mode)
        : undefined,
  };
}

export function mapCatalogItemToHermesExpert(item: RemoteCatalogItem, index: number): HermesExpert {
  const catalogSlug = item.slug;
  return {
    expertId: catalogSlug,
    slug: catalogSlug,
    expertSlug: catalogSlug,
    catalogSlug,
    catalogKind: "expert",
    remoteToolName: item.remoteToolName,
    name: item.displayName,
    displayName: item.displayName,
    category: item.category ?? "general",
    description: item.description,
    provider: "nodeskclaw",
    version: "1.0.0",
    tags: item.tags,
    domains: [],
    profile: {
      profileId: "remote",
      runtimeType: "hermes-local",
    },
    identity: {
      roleName: item.displayName,
      soulMd: `# ${item.displayName}\n${item.description}`,
    },
    capabilities: {
      skills: [],
      mcpServers: [],
      toolsets: [],
    },
    memory: { mode: "isolated" },
    policy: { allowedTools: [] },
    starterPrompts: [],
    installStatus: "installed",
    trustStatus: "trusted",
    toolName: item.remoteToolName,
    riskLevel: item.riskLevel ?? "medium",
    approvalMode: item.approvalMode === "admin" ? "server" : item.approvalMode ?? "server",
    authorized: true,
    artifactMode: "pull_only",
    outputFormats: ["markdown"],
    sourceType: "hermes_api_server",
    enabled: true,
    executionMode: "remote_mcp",
    publicSkillCount: item.publicSkillCount,
    callableSkillCount: item.callableSkillCount,
    catalogStatus: item.status,
    sortOrder: index,
  };
}

export function mapCatalogItemToHermesExpertTeam(item: RemoteCatalogItem): HermesExpertTeam {
  const catalogSlug = item.slug;
  return {
    teamId: catalogSlug,
    slug: catalogSlug,
    teamSlug: catalogSlug,
    catalogSlug,
    catalogKind: "expert_team",
    remoteToolName: item.remoteToolName,
    name: item.displayName,
    displayName: item.displayName,
    category: item.category ?? "general",
    description: item.description,
    version: "1.0.0",
    leader: {
      expertId: catalogSlug,
      roleName: "leader",
    },
    members: [],
    orchestration: {
      mode: "sequential_pipeline",
      mergeStrategy: "structured_report",
      maxRounds: 1,
    },
    starterPrompts: [],
    installStatus: "installed",
    tags: item.tags,
    toolName: item.remoteToolName,
    orchestrationMode:
      (item.orchestrationMode as HermesExpertTeam["orchestrationMode"]) ?? "gateway_sequential",
    riskLevel: item.riskLevel ?? "medium",
    approvalMode: item.approvalMode === "admin" ? "server" : item.approvalMode ?? "server",
    artifactMode: "pull_only",
    outputFormats: ["markdown"],
    executionMode: "remote_mcp",
    publicSkillCount: item.publicSkillCount,
    callableSkillCount: item.callableSkillCount,
    catalogStatus: item.status,
  };
}

export function extractTextContent(result: ToolsCallResult | unknown): string {
  const r = result as ToolsCallResult;
  if (!Array.isArray(r?.content)) {
    if (typeof result === "string") return result;
    return "";
  }
  return r.content
    .filter((c) => c.type === "text" || ("text" in c && c.text != null))
    .map((c) => ("text" in c ? c.text : ""))
    .join("\n")
    .trim();
}

export function normalizeExpertJsonRpcError(error: JsonRpcErrorPayload): HermesExpertsError {
  const data = error.data ?? {};
  const codeFromData =
    typeof data.errorCode === "string"
      ? data.errorCode
      : typeof data.error_code === "string"
        ? data.error_code
        : undefined;
  const message = error.message ?? "Expert MCP call failed";

  if (codeFromData) {
    return new HermesExpertsError(codeFromData, message);
  }
  if (message.includes("EXPERT_APPROVAL_REQUIRED") || message.includes("approval")) {
    return new HermesExpertsError("EXPERT_APPROVAL_REQUIRED", message);
  }
  if (message.includes("EXPERT_ROUTE_OVERRIDE_FORBIDDEN") || message.includes("route")) {
    return new HermesExpertsError("EXPERT_ROUTE_OVERRIDE_FORBIDDEN", message);
  }
  if (message.includes("EXPERT_UPSTREAM")) {
    return new HermesExpertsError("EXPERT_UPSTREAM_MCP_ERROR", message);
  }
  return new HermesExpertsError("EXPERT_MCP_CALL_FAILED", message);
}

/** @deprecated Use mapCatalogItemToHermesExpert — kept for tests. */
export function mapExpertMcpToolToExpert(tool: ExpertMcpToolDescriptor, index: number): HermesExpert | null {
  const item = mapCatalogTool(tool);
  if (!item || item.kind !== "expert") return null;
  return mapCatalogItemToHermesExpert(item, index);
}

/** @deprecated Use mapCatalogItemToHermesExpertTeam — kept for tests. */
export function mapExpertMcpToolToTeam(tool: ExpertMcpToolDescriptor): HermesExpertTeam | null {
  const item = mapCatalogTool(tool);
  if (!item || item.kind !== "expert_team") return null;
  return mapCatalogItemToHermesExpertTeam(item);
}

/** @deprecated Use mapSkillTool — kept for backward compatibility. */
export function mapMcpToolToExpertSkill(tool: ExpertMcpToolDescriptor) {
  const skill = mapSkillTool(tool);
  if (skill) return skill;
  const ann = readAnnotations(tool);
  const skillName = String(ann.skill_name ?? ann.skillName ?? tool.name);
  return {
    slug: String(ann.slug ?? tool.name),
    skillName,
    kind: "expert_skill" as const,
    displayName: String(ann.display_name ?? ann.displayName ?? tool.title ?? skillName),
    description: tool.description ?? "",
    inputSchema: tool.inputSchema ?? {},
    callEnabled: ann.call_enabled !== false && ann.callEnabled !== false,
    riskLevel: mapRiskLevel(ann.risk_level ?? ann.riskLevel),
    approvalMode: mapApprovalMode(ann.approval_mode ?? ann.approvalMode),
    outputFormats: [] as string[],
  };
}

export function extractMcpTextContent(result: unknown): string {
  return extractTextContent(result as ToolsCallResult);
}
