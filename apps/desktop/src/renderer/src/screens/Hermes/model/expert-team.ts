import type { WorkExpertStatus, WorkRiskLevel, WorkStarterPrompt } from "./expert";
import type { HermesExpertTeamInstallStatus } from "../../../../../shared/hermes-experts/hermes-experts-contract";

export interface WorkTeamMember {
  expertId: string;
  roleName: string;
  responsibility: string;
  required: boolean;
  order: number;
}

export type WorkExpertTeamInstallStatus = HermesExpertTeamInstallStatus;

export interface WorkExpertTeam {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  orchestration: "server_managed";
  category: string;
  tags: string[];
  members: WorkTeamMember[];
  status: WorkExpertStatus;
  riskLevel: WorkRiskLevel;
  starterPrompts: WorkStarterPrompt[];
  avatar?: string;
  skillCount?: number;
  toolName?: string;
  leaderRoleName?: string;
  memberCount?: number;
  executionMode?: string;
  installStatus?: WorkExpertTeamInstallStatus;
}
