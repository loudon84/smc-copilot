export const REMOTE_EXPERT_PROVIDER = "nodeskclaw-acp" as const;
export const REMOTE_EXPERT_EXECUTION_PROVIDER = "remote-expert-acp" as const;
export const REMOTE_EXPERT_CHAT_MODE = "remote-expert" as const;
export const ACP_PROTOCOL_VERSION = 1;
export const ACP_ADAPTER_CONTRACT_VERSION = "1.1.0";
export const REMOTE_EXPERT_CATALOG_VERSION = "1.0.0";
export const REMOTE_AGENT_CONTRACT_VERSION = "1.5.0";
export const ADAPTER_BINARY_VERSION = "1.6.1";

export type RemoteExpertStatus = "ready" | "unavailable";
export type RemoteExpertBindingState = "active" | "resume_blocked" | "closed";
export type RemoteExpertGateMode = "off" | "alpha";

export interface RemoteExpertCapabilities {
  acp_protocol_version: number;
  attachments: string;
  session_resume: boolean;
  [key: string]: unknown;
}

export interface RemoteExpertCatalogItem {
  agent_ref: string;
  display_name: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
  avatar?: string | null;
  status: RemoteExpertStatus;
  capabilities: RemoteExpertCapabilities;
}

export interface RemoteExpertCatalogList {
  items: RemoteExpertCatalogItem[];
}

export interface RemoteExpertProfileDraft {
  profile_version: 1;
  name: string;
  agent_ref: string;
  knowledge_refs: string[];
  connector_binding_refs: string[];
  integration_account_refs: string[];
}

export interface RemoteExpertAvailability {
  enabled: boolean;
  mode: RemoteExpertGateMode;
  packed: boolean;
  reason?: string;
  errorCode?: string;
}

export interface RemoteExpertBindingSnapshot {
  sessionId: string;
  provider: typeof REMOTE_EXPERT_PROVIDER;
  agentRef: string;
  acpSessionId: string;
  profileName: string;
  profileDigest: string;
  knowledgeRefs: string[];
  connectorBindingRefs: string[];
  integrationAccountRefs: string[];
  state: RemoteExpertBindingState;
}

export const REMOTE_EXPERT_FEATURE_ENV = "SMC_WORK_REMOTE_EXPERT";
export const ACP_ADAPTER_PATH_ENV = "SMC_WORK_ACP_ADAPTER_PATH";
