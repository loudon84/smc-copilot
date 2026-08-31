/**
 * Work Skill Run cross-process DTO owner.
 * Defines feature mode, catalog models, execution inputs, projection, continuation, and IPC contracts.
 * Distinct from legacy Expert contract v1.0.2.
 */

export const WORK_SKILL_RUN_CONTRACT_NAME = "WORK-SKILL-RUN-CONTRACT";
export const WORK_SKILL_RUN_CONTRACT_VERSION = "1.0.0";

export type SkillRunFeatureMode =
  | "expert-compat"
  | "skill-first"
  | "local-only";

export type SkillRunLocalPhase =
  | "pending-submit"
  | "starting"
  | "running"
  | "waiting-approval"
  | "discovering-artifacts"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired"
  | "unauthorized";

export type SkillRunTerminalPhase = Extract<
  SkillRunLocalPhase,
  "succeeded" | "failed" | "cancelled" | "expired" | "unauthorized"
>;

export function isSkillRunTerminalPhase(phase: SkillRunLocalPhase): phase is SkillRunTerminalPhase {
  return (
    phase === "succeeded" ||
    phase === "failed" ||
    phase === "cancelled" ||
    phase === "expired" ||
    phase === "unauthorized"
  );
}

export interface SkillCatalogToolItem {
  toolName: string;
  title: string;
  description?: string;
  category?: string;
  callability: "callable" | "disabled" | "unsupported";
  inputSchema?: Record<string, unknown>;
}

export type SkillCatalogStatus =
  | "ready"
  | "loading"
  | "unauthorized"
  | "backend-unavailable"
  | "contract-unsupported";

export interface SkillCatalogResponse {
  status: SkillCatalogStatus;
  tools: SkillCatalogToolItem[];
  reason?: string;
}

export interface SkillRunArtifactDescriptor {
  id: string;
  file_name: string;
  size_bytes?: number;
  mime_type?: string;
  sha256?: string;
  preview_supported?: boolean;
}

export interface SkillRunProjection {
  clientRequestId: string;
  providerRunId: string | null;
  toolName: string;
  promptSummary: string;
  sessionId: string;
  profileId: string;
  authGeneration?: string;
  phase: SkillRunLocalPhase;
  displayStage: string;
  lastEventId: string | null;
  eventSeq: number;
  text?: string;
  errorCode?: string;
  errorMessage?: string;
  artifacts?: SkillRunArtifactDescriptor[];
  createdAt: string;
  updatedAt: string;
}

export interface SkillRunContinuationItem {
  kind: "skill-run";
  schemaVersion: 1;
  clientRequestId: string;
  providerRunId: string | null;
  toolName: string;
  promptSummary: string;
  sessionId: string;
  profileId: string;
  authGeneration?: string;
  lastEventId: string | null;
  phase: SkillRunLocalPhase;
  text?: string;
  updatedAt: string;
}

export interface SkillRunStartInput {
  toolName: string;
  prompt: string;
  clientRequestId: string;
  sessionId: string;
  profileId: string;
  authGeneration?: string;
}

export type SkillRunStartResult =
  | {
      accepted: true;
      projection: SkillRunProjection;
    }
  | {
      accepted: false;
      errorCode: string;
      message: string;
      clientRequestId: string;
    };

export interface SkillRunCancelInput {
  clientRequestId: string;
  sessionId: string;
}

export interface SkillRunCancelResult {
  success: boolean;
  errorCode?: string;
  message?: string;
  projection?: SkillRunProjection;
}

export interface SkillRunRetryArtifactDiscoveryInput {
  clientRequestId: string;
  sessionId: string;
}

export interface SkillRunSessionModeSnapshot {
  executionMode: "skill-run";
  toolName: string;
  toolTitle: string;
  updatedAt: string;
}

export const SKILL_RUN_IPC_CHANNELS = {
  LIST_CATALOG: "skill-run:list-catalog",
  REFRESH_CATALOG: "skill-run:refresh-catalog",
  START: "skill-run:start",
  CANCEL: "skill-run:cancel",
  GET_FEATURE_MODE: "skill-run:get-feature-mode",
  GET_PROJECTION: "skill-run:get-projection",
  LIST_PROJECTIONS: "skill-run:list-projections",
  REHYDRATE_SESSION: "skill-run:rehydrate-session",
  RETRY_ARTIFACT_DISCOVERY: "skill-run:retry-artifact-discovery",
  GET_SESSION_MODE: "skill-run:get-session-mode",
  SET_SESSION_MODE: "skill-run:set-session-mode",
  ON_PROJECTION_CHANGED: "skill-run:on-projection-changed",
} as const;

export interface SkillRunApi {
  listCatalog(): Promise<SkillCatalogResponse>;
  refreshCatalog(): Promise<SkillCatalogResponse>;
  start(input: SkillRunStartInput): Promise<SkillRunStartResult>;
  cancel(input: SkillRunCancelInput): Promise<SkillRunCancelResult>;
  getFeatureMode(): Promise<{ mode: SkillRunFeatureMode }>;
  getProjection(clientRequestId: string): Promise<SkillRunProjection | null>;
  listProjections(sessionId: string): Promise<SkillRunProjection[]>;
  rehydrateSession(sessionId: string): Promise<SkillRunProjection[]>;
  retryArtifactDiscovery(input: SkillRunRetryArtifactDiscoveryInput): Promise<SkillRunProjection | null>;
  getSessionMode(sessionId: string): Promise<SkillRunSessionModeSnapshot | null>;
  setSessionMode(
    input: SkillRunSessionModeSnapshot & { sessionId: string },
  ): Promise<void>;
  onProjectionChanged(listener: (projection: SkillRunProjection) => void): () => void;
}
