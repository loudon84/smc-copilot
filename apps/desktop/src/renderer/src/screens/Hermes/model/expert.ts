import type {
  HermesExpertInstallStatus,
  HermesExpertTrustStatus,
  RemoteExpertExecutionMode,
} from "../../../../../shared/hermes-experts/hermes-experts-contract";

export type WorkExpertStatus = "ready" | "offline" | "disabled" | "error";
export type WorkRiskLevel = "low" | "medium" | "high";

export interface WorkExpertSkill {
  name: string;
  displayName: string;
  description?: string;
  riskLevel: WorkRiskLevel;
  outputFormat: "markdown" | "json" | "text" | "file";
  inputSchema?: Record<string, unknown>;
  callEnabled?: boolean;
  approvalMode?: string;
  outputFormats?: string[];
}

export type WorkExpertInstallStatus = HermesExpertInstallStatus;
export type WorkExpertTrustStatus = HermesExpertTrustStatus;
export type WorkExpertExecutionMode = RemoteExpertExecutionMode;

export interface WorkStarterPrompt {
  title: string;
  prompt: string;
}

export interface WorkExpertCapabilitySummary {
  skills: Array<{ skillId: string; name: string; version: string; required?: boolean }>;
  mcpServers: Array<{ serverId: string; name: string }>;
  allowedTools: string[];
}

export interface WorkExpert {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  provider: "expert_mcp" | "nodeskclaw" | "local";
  runtimeName?: string;
  category: string;
  tags: string[];
  status: WorkExpertStatus;
  riskLevel: WorkRiskLevel;
  skillCount: number;
  availableSkills: WorkExpertSkill[];
  starterPrompts: WorkStarterPrompt[];
  avatar?: string;
  executionMode?: WorkExpertExecutionMode;
  installStatus?: WorkExpertInstallStatus;
  trustStatus?: WorkExpertTrustStatus;
  publicSkillCount?: number;
  profileId?: string;
  approvalMode?: string;
  outputFormats?: string[];
  roleName?: string;
  capabilities?: WorkExpertCapabilitySummary;
}
