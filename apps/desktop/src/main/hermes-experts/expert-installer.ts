/** @deprecated V7.2 — local Profile install superseded by remote MCP experts. Kept for rollback only. */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { profileHome } from "../utils";
import type { ExpertInstallPlan, InstallOptions } from "../../shared/hermes-experts/hermes-experts-contract";
import { HermesExpertsError } from "../../shared/hermes-experts/hermes-experts-errors";
import {
  createExpertRun,
  insertInstallEvent,
  upsertExpertInstance,
  upsertExpertTeamInstance,
} from "./expert-runtime-db";
import { getExpert, getExpertTeam } from "./expert-catalog-client";
import { getMockExpert } from "./expert-mock-catalog";
import { materializeExpertPolicyAndConfig } from "./expert-install-materializer";
import { runExpertPreflight } from "./expert-preflight";

function resolveProfileName(profileId: string): string {
  return profileId.includes(".") ? profileId : profileId;
}

function writeProfileFile(
  home: string,
  relativePath: string,
  content: string,
  mergePolicy: "replace" | "skip_if_exists" | "append",
): void {
  const fullPath = join(home, relativePath);
  const dir = join(fullPath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (mergePolicy === "skip_if_exists" && existsSync(fullPath)) return;
  if (mergePolicy === "append" && existsSync(fullPath)) {
    appendFileSync(fullPath, `\n${content}`, "utf-8");
    return;
  }
  writeFileSync(fullPath, content, "utf-8");
}

function writeExpertManifest(home: string, expertId: string, plan: ExpertInstallPlan): void {
  const desktopDir = join(home, "desktop");
  if (!existsSync(desktopDir)) mkdirSync(desktopDir, { recursive: true });
  writeFileSync(
    join(desktopDir, "expert-manifest.json"),
    JSON.stringify({ expertId, planId: plan.planId, installedAt: new Date().toISOString() }, null, 2),
    "utf-8",
  );
  writeFileSync(
    join(desktopDir, "install-plan.json"),
    JSON.stringify(plan, null, 2),
    "utf-8",
  );
}

export async function materializeInstallPlan(
  plan: ExpertInstallPlan,
  expertIdOrMap: string | Record<string, string>,
  options?: InstallOptions,
): Promise<{ profileIds: string[] }> {
  const resolveExpertId = (profileId: string): string =>
    typeof expertIdOrMap === "string" ? expertIdOrMap : (expertIdOrMap[profileId] ?? expertIdOrMap["*"] ?? "");

  const profileIds: string[] = [];
  const installRun = createExpertRun({
    runType: "single_expert",
    profileId: plan.profiles[0]?.profileId ?? "default",
    title: `Install ${plan.target.id}`,
    userPrompt: "",
    status: "running",
  });

  for (const profile of plan.profiles) {
    const expertId = resolveExpertId(profile.profileId);
    if (!expertId) {
      throw new HermesExpertsError("EXPERT_NOT_FOUND", profile.profileId);
    }
    const preflight = await runExpertPreflight({ profileId: profile.profileId, port: profile.port });
    if (!preflight.ok) {
      throw new HermesExpertsError(preflight.errorCode ?? "EXPERT_INSTALL_FAILED", preflight.message ?? "Preflight failed");
    }
    const name = resolveProfileName(profile.profileId);
    const home = profileHome(name);
    if (!existsSync(home)) mkdirSync(home, { recursive: true });

    for (const file of profile.files) {
      if (!options?.overwrite && file.mergePolicy === "replace" && existsSync(join(home, file.path))) {
        if (file.path === "USER.md") {
          writeProfileFile(home, file.path, file.content, "skip_if_exists");
          continue;
        }
      }
      writeProfileFile(home, file.path, file.content, file.mergePolicy);
    }

    const configPath = join(home, "config.yaml");
    if (!existsSync(configPath)) {
      writeFileSync(configPath, `gateway:\n  port: ${profile.port}\n`, "utf-8");
    }

    const memoryPath = join(home, "memories", "MEMORY.md");
    const expert = (await getExpert(expertId)) ?? getMockExpert(expertId);
    if (expert?.memory.seedMemoryMd) {
      if (!existsSync(join(home, "memories"))) mkdirSync(join(home, "memories"), { recursive: true });
      if (!existsSync(memoryPath)) {
        writeFileSync(memoryPath, expert.memory.seedMemoryMd, "utf-8");
      } else {
        writeProfileFile(home, "memories/MEMORY.md", expert.memory.seedMemoryMd, "append");
      }
    }

    writeExpertManifest(home, expertId, plan);
    profileIds.push(profile.profileId);

    upsertExpertInstance({
      expertId,
      profileId: profile.profileId,
      profileHome: home,
      status: "installed",
      installedVersion: plan.target.version,
      gatewayPort: profile.port,
    });

    if (expert) {
      materializeExpertPolicyAndConfig({
        profileName: name,
        home,
        port: profile.port,
        expert,
        plan,
        options,
        installRunId: installRun.runId,
      });
    }
  }

  insertInstallEvent({
    targetType: plan.target.kind,
    targetId: plan.target.id,
    action: "install",
    status: "succeeded",
    payload: { profileIds, options },
  });

  return { profileIds };
}

export async function installExpertById(
  expertId: string,
  plan: ExpertInstallPlan,
  options?: InstallOptions,
): Promise<{ profileId: string }> {
  const expert = (await getExpert(expertId)) ?? getMockExpert(expertId);
  if (!expert) throw new HermesExpertsError("EXPERT_NOT_FOUND", expertId);
  const { profileIds } = await materializeInstallPlan(plan, expertId, options);
  return { profileId: profileIds[0] ?? expert.profile.profileId };
}

export async function installTeamById(
  teamId: string,
  plan: ExpertInstallPlan,
  options?: InstallOptions,
): Promise<{ profileIds: string[] }> {
  const team = await getExpertTeam(teamId);
  if (!team) throw new HermesExpertsError("TEAM_NOT_FOUND", teamId);
  const expertIdByProfile: Record<string, string> = {};
  const memberExpertIds = [team.leader.expertId, ...team.members.map((m) => m.expertId)];
  const experts = await Promise.all(
    memberExpertIds.map(async (id) => (await getExpert(id)) ?? getMockExpert(id)),
  );
  for (const expert of experts) {
    if (expert) expertIdByProfile[expert.profile.profileId] = expert.expertId;
  }
  const { profileIds } = await materializeInstallPlan(plan, expertIdByProfile, options);

  const leader = experts.find((e) => e?.expertId === team.leader.expertId);
  if (leader) {
    upsertExpertTeamInstance({
      teamId,
      leaderProfileId: leader.profile.profileId,
      installedVersion: plan.target.version,
      members: [
        {
          expertId: team.leader.expertId,
          profileId: leader.profile.profileId,
          roleName: team.leader.roleName,
          isLeader: true,
          sortOrder: 0,
        },
        ...team.members.map((m, idx) => {
          const expert = experts.find((e) => e?.expertId === m.expertId);
          return {
            expertId: m.expertId,
            profileId: expert?.profile.profileId ?? m.expertId,
            roleName: m.roleName,
            responsibility: m.responsibility,
            sortOrder: m.order ?? idx + 1,
          };
        }),
      ],
    });
  }

  return { profileIds };
}
