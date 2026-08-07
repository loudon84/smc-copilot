/** @deprecated V7.2 — local Profile materialization superseded by remote MCP experts. */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type {
  ExpertInstallPlan,
  ExpertRiskReport,
  HermesExpert,
  HermesExpertPolicy,
} from "../../shared/hermes-experts/hermes-experts-contract";
import { readHermesConfig, writeHermesConfig, type HermesConfigDocument } from "../hermes-config/hermes-config-yaml";
import { isServeControlPlanePreferred } from "../copilot-runtime-client/runtime-mode";
import { installSkill } from "../skills";
import { insertRunEvent } from "./expert-runtime-db";
import { registerExpertProfileRuntime } from "./expert-profile-manager";

function writePolicyJson(home: string, policy: HermesExpertPolicy, riskReport: ExpertRiskReport): void {
  const desktopDir = join(home, "desktop");
  if (!existsSync(desktopDir)) mkdirSync(desktopDir, { recursive: true });
  writeFileSync(
    join(desktopDir, "policy.json"),
    JSON.stringify(
      {
        allowedTools: policy.allowedTools,
        deniedTools: policy.deniedTools ?? [],
        requireApproval: policy.requireApproval ?? [],
        allowedDomains: policy.allowedDomains ?? [],
        delegationTargets: policy.delegationTargets ?? [],
        riskReport,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

function mergeInstallPlanConfig(profileName: string, port: number, plan: ExpertInstallPlan): void {
  const doc = readHermesConfig(profileName) as HermesConfigDocument & {
    mcp_servers?: Record<string, Record<string, unknown>>;
    toolsets?: Record<string, boolean>;
  };

  doc.platforms = doc.platforms ?? {};
  doc.platforms.api_server = {
    host: "127.0.0.1",
    port,
  };

  if (plan.mcpServers.length > 0) {
    doc.mcp_servers = doc.mcp_servers ?? {};
    for (const mcp of plan.mcpServers) {
      doc.mcp_servers[mcp.serverId] = {
        name: mcp.name,
        url: mcp.url,
        transport: mcp.transport,
        trust_required: mcp.trustRequired ?? false,
      };
    }
  }

  // Phase 2 hardening: Serve owns Hermes YAML; skip Desktop write under Serve CP.
  if (isServeControlPlanePreferred()) {
    console.warn(
      `[expert-install] Serve control plane preferred — skip writeHermesConfig for profile=${profileName}`,
    );
    return;
  }

  writeHermesConfig(profileName, doc);
}

function installPlanSkills(profileName: string, plan: ExpertInstallPlan, enabled: boolean): void {
  if (!enabled) return;
  for (const skill of plan.skills) {
    if (!skill.required) continue;
    const identifier = skill.installSource || skill.skillId;
    void installSkill(identifier, profileName);
  }
}

export function materializeExpertPolicyAndConfig(input: {
  profileName: string;
  home: string;
  port: number;
  expert: HermesExpert;
  plan: ExpertInstallPlan;
  options?: { installSkills?: boolean; registerMcp?: boolean };
  installRunId?: string;
}): void {
  writePolicyJson(input.home, input.expert.policy, input.plan.riskReport);
  mergeInstallPlanConfig(input.profileName, input.port, input.plan);
  installPlanSkills(input.profileName, input.plan, input.options?.installSkills !== false);

  if (input.options?.registerMcp !== false && input.plan.mcpServers.length > 0 && input.installRunId) {
    for (const mcp of input.plan.mcpServers) {
      insertRunEvent({
        runId: input.installRunId,
        eventType: "mcp_registered",
        sourceProfileId: input.expert.profile.profileId,
        payload: { serverId: mcp.serverId, name: mcp.name, url: mcp.url },
      });
    }
  }

  registerExpertProfileRuntime({
    profileId: input.expert.profile.profileId,
    displayName: input.expert.displayName,
    port: input.port,
    profileHomePath: input.home,
    expertId: input.expert.expertId,
  });
}
