import { resolveBackendBaseUrl } from "../mcp-skill-gateway-runtime/mcp-skill-gateway-config";
import { getDeviceIdentity } from "../genehub/device-identity";
import type {
  ExpertCatalogPage,
  ExpertCatalogQuery,
  ExpertGatewayDiagnostics,
  ExpertInstallPlan,
  ExpertTeamCatalogPage,
  ExpertTeamCatalogQuery,
  HermesExpert,
  HermesExpertTeam,
} from "../../shared/hermes-experts/hermes-experts-contract";
import { HermesExpertsError } from "../../shared/hermes-experts/hermes-experts-errors";
import {
  EXPERT_CATALOG_CACHE_VERSION,
  resolveExpertHealthUrl,
  resolveExpertMcpRootUrl,
} from "./expert-mcp-endpoint";
import {
  MOCK_EXPERT_CATALOG,
  MOCK_EXPERT_TEAMS,
  getMockExpert,
  getMockTeam,
} from "./expert-mock-catalog";
import {
  clearExpertCatalogCaches,
  getCachedExpert,
  getCachedTeam,
  getExpertCatalogMeta,
  getExpertInstance,
  listCachedExperts,
  listCachedTeams,
  replaceExpertCatalogCache,
  replaceExpertTeamCatalogCache,
} from "./expert-runtime-db";
import { unwrapNodeDeskClawResponse } from "../auth/nodeskclaw-auth-response";
import { getMcpAccessToken } from "../mcp-skill-gateway-runtime/mcp-token-provider";

export type ExpertCatalogSource = "remote" | "cache" | "mock" | "legacy_rest_fallback";

let lastCatalogSource: ExpertCatalogSource = "mock";
let lastCatalogError: string | undefined;

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

async function expertsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const backend = resolveBackendBaseUrl();
  if (!backend) {
    throw new HermesExpertsError("NODESKCLAW_BACKEND_UNREACHABLE", "Backend URL is not configured");
  }
  const token = getMcpAccessToken();
  if (!token) {
    throw new HermesExpertsError("NODESKCLAW_UNAUTHORIZED", "Desktop login required");
  }
  const device = getDeviceIdentity();
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "X-NoDeskClaw-Desktop-Device-Id": device.deviceFingerprint,
    "X-NoDeskClaw-Client": "copilot-desktop",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body) headers["Content-Type"] = "application/json";

  const res = await fetch(joinUrl(backend, path), { ...init, headers });
  if (!res.ok) {
    throw new HermesExpertsError(
      res.status === 401 ? "NODESKCLAW_UNAUTHORIZED" : "NODESKCLAW_BACKEND_UNREACHABLE",
      `HTTP ${res.status}`,
    );
  }
  const json = (await res.json()) as unknown;
  return unwrapNodeDeskClawResponse<T>(json);
}

function applyInstallStatus(expert: HermesExpert): HermesExpert {
  if (expert.executionMode === "remote_mcp" || expert.profile.profileId === "remote") {
    return { ...expert, installStatus: "installed" };
  }
  const instance = getExpertInstance(expert.expertId);
  if (!instance) return expert;
  return {
    ...expert,
    installStatus: instance.status === "installed" ? "installed" : expert.installStatus,
    trustStatus: instance.trustStatus as HermesExpert["trustStatus"],
  };
}

function filterExperts(items: HermesExpert[], query?: ExpertCatalogQuery): HermesExpert[] {
  let result = items.map(applyInstallStatus);
  if (query?.category && query.category !== "all") {
    result = result.filter((e) => e.category === query.category);
  }
  if (query?.keyword?.trim()) {
    const q = query.keyword.trim().toLowerCase();
    result = result.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  return result;
}

function filterTeams(items: HermesExpertTeam[], query?: ExpertTeamCatalogQuery): HermesExpertTeam[] {
  let result = items;
  if (query?.category && query.category !== "all") {
    result = result.filter((t) => t.category === query.category);
  }
  if (query?.keyword?.trim()) {
    const q = query.keyword.trim().toLowerCase();
    result = result.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
    );
  }
  return result;
}

function paginate<T>(items: T[], page: number, pageSize: number): { items: T[]; total: number } {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length };
}

async function listExpertsFromLegacyRest(): Promise<HermesExpert[]> {
  const data = await expertsFetch<{ items?: HermesExpert[] }>(
    "/api/v1/hermes/experts?page=1&pageSize=100",
  );
  return (data.items ?? []).filter((e) => e.catalogKind === "expert" || e.executionMode === "remote_mcp");
}

async function listTeamsFromLegacyRest(): Promise<HermesExpertTeam[]> {
  const data = await expertsFetch<{ items?: HermesExpertTeam[] }>(
    "/api/v1/hermes/expert-teams?page=1&pageSize=100",
  );
  return (data.items ?? []).filter((t) => t.catalogKind === "expert_team");
}

export function getLastExpertCatalogSource(): ExpertCatalogSource {
  return lastCatalogSource;
}

export function getLastExpertCatalogError(): string | undefined {
  return lastCatalogError;
}

export async function getExpertGatewayDiagnostics(): Promise<ExpertGatewayDiagnostics> {
  const backendBaseUrl = resolveBackendBaseUrl() ?? "";
  return {
    ok: Boolean(backendBaseUrl && resolveExpertMcpRootUrl()),
    backendBaseUrl,
    expertHealthUrl: resolveExpertHealthUrl(),
    expertMcpRootUrl: resolveExpertMcpRootUrl(),
    currentCatalogSource: lastCatalogSource,
    lastError: lastCatalogError,
    catalogCacheVersion: getExpertCatalogMeta("cache_version") ?? EXPERT_CATALOG_CACHE_VERSION,
  };
}

export async function clearExpertCatalogCache(): Promise<{ ok: true }> {
  clearExpertCatalogCaches();
  lastCatalogSource = "mock";
  lastCatalogError = undefined;
  return { ok: true };
}

export async function listExpertCatalog(query?: ExpertCatalogQuery): Promise<ExpertCatalogPage> {
  const page = query?.page ?? 1;
  const pageSize = query?.pageSize ?? 20;

  const { listExpertsFromExpertMcpGateway } = await import("./expert-remote-catalog");
  const mcpResult = await listExpertsFromExpertMcpGateway();

  if (mcpResult.mcpReached) {
    replaceExpertCatalogCache(mcpResult.experts, "remote");
    lastCatalogSource = "remote";
    lastCatalogError = mcpResult.experts.length === 0 ? "EXPERT_CATALOG_EMPTY" : undefined;
    const items = filterExperts(mcpResult.experts, query);
    const paged = paginate(items, page, pageSize);
    return { ...paged, page, pageSize, source: "remote" };
  }

  lastCatalogError = mcpResult.error;

  const cached = listCachedExperts();
  if (cached.length > 0) {
    lastCatalogSource = "cache";
    const items = filterExperts(cached, query);
    const paged = paginate(items, page, pageSize);
    return { ...paged, page, pageSize, source: "cache" };
  }

  try {
    const legacy = await listExpertsFromLegacyRest();
    if (legacy.length > 0) {
      replaceExpertCatalogCache(legacy, "legacy_rest_fallback");
      lastCatalogSource = "legacy_rest_fallback";
      const items = filterExperts(legacy, query);
      const paged = paginate(items, page, pageSize);
      return { ...paged, page, pageSize, source: "legacy_rest_fallback" };
    }
  } catch {
    /* ignore legacy failure */
  }

  lastCatalogSource = "mock";
  const base = MOCK_EXPERT_CATALOG.map((e) => ({
    ...e,
    executionMode: "remote_mcp" as const,
    installStatus: "installed" as const,
    catalogKind: "expert" as const,
    expertSlug: e.expertSlug ?? e.slug,
    catalogSlug: e.catalogSlug ?? e.expertSlug ?? e.slug,
    toolName: e.toolName ?? e.expertSlug ?? e.slug,
    profile: { ...e.profile, profileId: "remote" },
  }));
  const items = filterExperts(base, query);
  const paged = paginate(items, page, pageSize);
  return { ...paged, page, pageSize, source: "mock" };
}

export async function getExpert(expertId: string): Promise<HermesExpert | null> {
  const cached = getCachedExpert(expertId) ?? getMockExpert(expertId);
  return cached ? applyInstallStatus(cached) : null;
}

export async function listExpertTeams(query?: ExpertTeamCatalogQuery): Promise<ExpertTeamCatalogPage> {
  const page = query?.page ?? 1;
  const pageSize = query?.pageSize ?? 20;

  const { listTeamsFromExpertMcpGateway } = await import("./expert-remote-catalog");
  const mcpResult = await listTeamsFromExpertMcpGateway();

  if (mcpResult.mcpReached) {
    replaceExpertTeamCatalogCache(mcpResult.teams, "remote");
    lastCatalogSource = "remote";
    lastCatalogError = mcpResult.teams.length === 0 ? "EXPERT_CATALOG_EMPTY" : undefined;
    const items = filterTeams(mcpResult.teams, query);
    const paged = paginate(items, page, pageSize);
    return { ...paged, page, pageSize, source: "remote" };
  }

  lastCatalogError = mcpResult.error;

  const cached = listCachedTeams();
  if (cached.length > 0) {
    lastCatalogSource = "cache";
    const items = filterTeams(cached, query);
    const paged = paginate(items, page, pageSize);
    return { ...paged, page, pageSize, source: "cache" };
  }

  try {
    const legacy = await listTeamsFromLegacyRest();
    if (legacy.length > 0) {
      replaceExpertTeamCatalogCache(legacy, "legacy_rest_fallback");
      lastCatalogSource = "legacy_rest_fallback";
      const items = filterTeams(legacy, query);
      const paged = paginate(items, page, pageSize);
      return { ...paged, page, pageSize, source: "legacy_rest_fallback" };
    }
  } catch {
    /* ignore legacy failure */
  }

  lastCatalogSource = "mock";
  const base = MOCK_EXPERT_TEAMS.map((t) => ({
    ...t,
    executionMode: "remote_mcp" as const,
    installStatus: "installed" as const,
    catalogKind: "expert_team" as const,
    teamSlug: t.teamSlug ?? t.slug,
    catalogSlug: t.catalogSlug ?? t.teamSlug ?? t.slug,
    toolName: t.toolName ?? t.teamSlug ?? t.slug,
    orchestrationMode: "server_managed" as const,
  }));
  const items = filterTeams(base, query);
  const paged = paginate(items, page, pageSize);
  return { ...paged, page, pageSize, source: "mock" };
}

export async function getExpertTeam(teamId: string): Promise<HermesExpertTeam | null> {
  return getCachedTeam(teamId) ?? getMockTeam(teamId);
}

function buildLocalInstallPlan(expert: HermesExpert): ExpertInstallPlan {
  return {
    planId: `plan_${expert.expertId}_local`,
    target: { kind: "expert", id: expert.expertId, version: expert.version },
    profiles: [
      {
        profileId: expert.profile.profileId,
        displayName: expert.displayName,
        port: expert.profile.port ?? 9601,
        files: [
          { path: "SOUL.md", content: expert.identity.soulMd, mergePolicy: "replace" },
          {
            path: "USER.md",
            content: expert.identity.userMd ?? "",
            mergePolicy: "skip_if_exists",
          },
        ],
      },
    ],
    skills: expert.capabilities.skills.map((s) => ({
      skillId: s.skillId,
      name: s.name,
      version: s.version,
      installSource: s.source,
      required: s.required,
    })),
    mcpServers: expert.capabilities.mcpServers.map((m) => ({
      serverId: m.serverId,
      name: m.name,
      url: m.url ?? "",
      transport: m.transport,
      trustRequired: m.trustRequired,
    })),
    riskReport: {
      riskLevel: expert.capabilities.mcpServers.length > 0 ? "P1" : "P2",
      warnings: expert.capabilities.mcpServers.map((m) => `MCP: ${m.name}`),
      permissions: expert.policy.allowedTools,
      requiresUserApproval: true,
    },
  };
}

function buildLocalTeamInstallPlan(team: HermesExpertTeam, experts: HermesExpert[]): ExpertInstallPlan {
  const profiles = experts.map((e) => ({
    profileId: e.profile.profileId,
    displayName: e.displayName,
    port: e.profile.port ?? 9601,
    files: [{ path: "SOUL.md", content: e.identity.soulMd, mergePolicy: "skip_if_exists" as const }],
  }));
  return {
    planId: `plan_${team.teamId}_local`,
    target: { kind: "expert_team", id: team.teamId, version: team.version },
    profiles,
    skills: [],
    mcpServers: [],
    riskReport: {
      riskLevel: "P1",
      warnings: ["该团队会创建多个 Hermes Profile。"],
      permissions: ["profile.create", "profile.delegate"],
      requiresUserApproval: true,
    },
  };
}

export async function fetchExpertInstallPlan(expertId: string): Promise<ExpertInstallPlan> {
  const expert = (await getExpert(expertId)) ?? getMockExpert(expertId);
  if (!expert) throw new HermesExpertsError("EXPERT_NOT_FOUND", expertId);
  try {
    const device = getDeviceIdentity();
    return await expertsFetch<ExpertInstallPlan>(
      `/api/v1/hermes/experts/${encodeURIComponent(expertId)}/install-plan`,
      {
        method: "POST",
        body: JSON.stringify({
          desktopId: device.deviceFingerprint,
          targetProfileId: expert.profile.profileId,
          options: { overwrite: false, installSkills: true, registerMcp: true },
        }),
      },
    );
  } catch {
    return buildLocalInstallPlan(expert);
  }
}

export async function fetchTeamInstallPlan(teamId: string): Promise<ExpertInstallPlan> {
  const team = (await getExpertTeam(teamId)) ?? getMockTeam(teamId);
  if (!team) throw new HermesExpertsError("TEAM_NOT_FOUND", teamId);
  const memberExperts = (
    await Promise.all(
      [team.leader.expertId, ...team.members.map((m) => m.expertId)].map((id) => getExpert(id)),
    )
  ).filter((e): e is HermesExpert => e != null);
  try {
    const device = getDeviceIdentity();
    return await expertsFetch<ExpertInstallPlan>(
      `/api/v1/hermes/expert-teams/${encodeURIComponent(teamId)}/install-plan`,
      {
        method: "POST",
        body: JSON.stringify({
          desktopId: device.deviceFingerprint,
          options: { overwrite: false, installSkills: true, registerMcp: true },
        }),
      },
    );
  } catch {
    return buildLocalTeamInstallPlan(team, memberExperts);
  }
}
