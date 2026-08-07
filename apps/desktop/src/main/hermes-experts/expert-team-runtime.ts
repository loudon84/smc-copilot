import type { SummonTeamInput, SummonTeamResult } from "../../shared/hermes-experts/hermes-experts-contract";
import { getExpertTeam } from "./expert-catalog-client";
import { getMockTeam } from "./expert-mock-catalog";
import { resolveDefaultExpertSkill } from "./expert-mcp-client";
import { getExpertRun } from "./expert-runtime-db";
import { callCatalogSkill, summonExpert } from "./expert-runtime";

function resolveTeamSlug(team: NonNullable<Awaited<ReturnType<typeof getExpertTeam>>>): string {
  return (team.catalogSlug ?? team.teamSlug ?? team.slug ?? team.teamId).trim();
}

export async function summonTeam(input: SummonTeamInput): Promise<SummonTeamResult> {
  const team = (await getExpertTeam(input.teamId)) ?? getMockTeam(input.teamId);
  if (!team) {
    return { ok: false, errorCode: "TEAM_NOT_FOUND", message: input.teamId };
  }

  const slug = (input.slug ?? resolveTeamSlug(team)).trim();
  if (!slug) {
    return { ok: false, errorCode: "EXPERT_TOOL_NAME_REQUIRED", message: input.teamId };
  }

  const prompt =
    input.userPrompt?.trim() ||
    team.starterPrompts[0]?.prompt ||
    `请执行团队任务：${team.displayName}`;

  const skillName =
    input.skillName?.trim() ?? (await resolveDefaultExpertSkill(slug, "expert_team_skill"));
  if (!skillName) {
    return { ok: false, errorCode: "EXPERT_TOOL_NAME_REQUIRED", message: "No callable team skill found" };
  }

  const result = await callCatalogSkill({
    slug,
    catalogKind: "expert_team",
    skillName,
    prompt,
    context: input.context,
    sessionId: input.sessionId,
  });

  if (!result.ok) {
    return {
      ok: false,
      errorCode: result.errorCode,
      message: result.message,
      teamId: input.teamId,
      runId: result.runId,
    };
  }

  return {
    ok: true,
    teamId: input.teamId,
    leaderProfileId: "remote",
    profileId: "remote",
    runId: result.runId,
    sessionId: input.sessionId,
    runtimeStatus: "running",
    message: `Team ${team.displayName} completed`,
  };
}

/** @deprecated V7.2 — team orchestration is server_managed; no local leader dispatch. */
export async function dispatchTeamRun(_input: {
  runId: string;
  teamId: string;
  leaderProfileId: string;
  userPrompt: string;
}): Promise<void> {
  /* no-op */
}

export async function retryExpertRun(runId: string): Promise<SummonTeamResult> {
  const run = getExpertRun(runId);
  if (!run) {
    return { ok: false, errorCode: "EXPERT_RUN_NOT_FOUND", message: runId };
  }
  if (run.runType === "team" && run.teamId) {
    return summonTeam({
      teamId: run.teamId,
      userPrompt: run.userPrompt,
      sessionId: run.sessionId,
      slug: run.catalogSlug,
      skillName: run.skillName,
    });
  }
  if (run.expertId) {
    return summonExpert({
      expertId: run.expertId,
      userPrompt: run.userPrompt,
      sessionId: run.sessionId,
      slug: run.catalogSlug,
      skillName: run.skillName,
    });
  }
  return { ok: false, errorCode: "EXPERT_RUN_NOT_FOUND", message: runId };
}
