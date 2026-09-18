/**
 * Typed Knowledge Set IPC (Renderer ↔ Main).
 * Maps knowledge-frontend-contract v1.0.0 KnowledgeSet / RetrievalProfile.
 * Never carry tokens, absolute paths, or localized server `message`.
 */

export const KNOWLEDGE_SET_IPC_CHANNELS = {
  list: "knowledge-set:list",
  get: "knowledge-set:get",
  create: "knowledge-set:create",
  update: "knowledge-set:update",
  bindBase: "knowledge-set:bind-base",
  unbindBase: "knowledge-set:unbind-base",
  listProfiles: "knowledge-set:list-profiles",
  createProfile: "knowledge-set:create-profile",
  getProfile: "knowledge-set:get-profile",
  updateProfile: "knowledge-set:update-profile",
  publishProfile: "knowledge-set:publish-profile",
  rollbackProfile: "knowledge-set:rollback-profile",
} as const;

export type KnowledgeSetIpcChannel =
  (typeof KNOWLEDGE_SET_IPC_CHANNELS)[keyof typeof KNOWLEDGE_SET_IPC_CHANNELS];

export type KnowledgeSetStatus = "active" | "disabled";

export type KnowledgeSetVisibility = "private" | "department" | "organization";

export type KnowledgeRetrievalProfileStatus = "draft" | "active" | "archived";

export interface KnowledgeSetBoundBase {
  knowledgeBaseId: string;
  name?: string | null;
  weight?: number | null;
}

export interface KnowledgeSetSnapshot {
  id: string;
  name: string;
  description: string | null;
  status: KnowledgeSetStatus;
  visibility: KnowledgeSetVisibility;
  ownerMemberId?: string;
  usageCount: number;
  lastUsedAt?: string | null;
  knowledgeBases: KnowledgeSetBoundBase[];
}

export interface KnowledgeSetPage {
  items: KnowledgeSetSnapshot[];
  total: number;
  page: number;
  pageSize: number;
}

export interface KnowledgeSetListInput {
  page?: number;
  pageSize?: number;
  q?: string;
}

export interface KnowledgeSetGetInput {
  knowledgeSetId: string;
}

export interface KnowledgeSetCreateInput {
  name: string;
  description?: string | null;
  visibility?: KnowledgeSetVisibility;
}

export interface KnowledgeSetUpdateInput {
  knowledgeSetId: string;
  name?: string;
  description?: string | null;
  status?: KnowledgeSetStatus;
  visibility?: KnowledgeSetVisibility;
}

export interface KnowledgeSetBindBaseInput {
  knowledgeSetId: string;
  knowledgeBaseId: string;
  weight?: number;
  sortOrder?: number;
}

export interface KnowledgeSetUnbindBaseInput {
  knowledgeSetId: string;
  knowledgeBaseId: string;
}

export interface KnowledgeRetrievalProfileSnapshot {
  id: string;
  knowledgeSetId: string;
  version: number;
  config: Record<string, unknown>;
  status: KnowledgeRetrievalProfileStatus;
  createdByMemberId?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  activatedAt?: string | null;
}

export interface KnowledgeSetListProfilesInput {
  knowledgeSetId: string;
}

export interface KnowledgeSetCreateProfileInput {
  knowledgeSetId: string;
  config?: Record<string, unknown> | null;
}

export interface KnowledgeProfileIdInput {
  profileId: string;
}

export interface KnowledgeSetUpdateProfileInput {
  profileId: string;
  config: Record<string, unknown>;
}

export interface KnowledgeSetRollbackProfileInput {
  profileId: string;
  publish?: boolean;
}

export function knowledgeSetActionAllowed(
  status: KnowledgeSetStatus | undefined,
): boolean {
  return status === "active";
}

export interface HermesKnowledgeSetsAPI {
  list(input?: KnowledgeSetListInput): Promise<KnowledgeSetPage>;
  get(input: KnowledgeSetGetInput): Promise<KnowledgeSetSnapshot>;
  create(input: KnowledgeSetCreateInput): Promise<KnowledgeSetSnapshot>;
  update(input: KnowledgeSetUpdateInput): Promise<KnowledgeSetSnapshot>;
  bindBase(input: KnowledgeSetBindBaseInput): Promise<KnowledgeSetSnapshot>;
  unbindBase(input: KnowledgeSetUnbindBaseInput): Promise<KnowledgeSetSnapshot>;
  listProfiles(
    input: KnowledgeSetListProfilesInput,
  ): Promise<KnowledgeRetrievalProfileSnapshot[]>;
  createProfile(
    input: KnowledgeSetCreateProfileInput,
  ): Promise<KnowledgeRetrievalProfileSnapshot>;
  getProfile(
    input: KnowledgeProfileIdInput,
  ): Promise<KnowledgeRetrievalProfileSnapshot>;
  updateProfile(
    input: KnowledgeSetUpdateProfileInput,
  ): Promise<KnowledgeRetrievalProfileSnapshot>;
  publishProfile(
    input: KnowledgeProfileIdInput,
  ): Promise<KnowledgeRetrievalProfileSnapshot>;
  rollbackProfile(
    input: KnowledgeSetRollbackProfileInput,
  ): Promise<KnowledgeRetrievalProfileSnapshot>;
}
