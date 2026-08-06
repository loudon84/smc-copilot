/**
 * v8.2 Session Catalog — profile-aware session directory contract.
 * Reads real Profile state.db + desktop metadata; not sessions.json.
 */

export type SessionCatalogStatus =
  | "active"
  | "completed"
  | "waiting_approval"
  | "waiting_clarify"
  | "interrupted"
  | "failed";

export type SessionCatalogItem = {
  profileId: string;
  sessionId: string;

  title: string;
  startedAt: number;
  updatedAt: number;

  messageCount: number;
  model?: string;
  source?: string;

  status: SessionCatalogStatus;

  linkedRunId?: string;
  expertId?: string;
  teamId?: string;

  pinned: boolean;
  archived: boolean;
};

export type SessionCatalogDraftItem = {
  runId: string;
  workspaceId: string;
  profileId: string;
  title: string;
  draft?: string | null;
  updatedAt: number;
  modelId?: string | null;
};

export type SessionCatalogQuery = {
  /** Omit or "all" → every known profile. */
  profileId?: string | "all";
  search?: string;
  status?: SessionCatalogStatus | "all";
  includeArchived?: boolean;
  includeDrafts?: boolean;
  limit?: number;
  offset?: number;
};

export type SessionCatalogListResult = {
  items: SessionCatalogItem[];
  drafts: SessionCatalogDraftItem[];
  total: number;
  profilesUnavailable: string[];
  error?: string;
};

export type SessionCatalogRenameInput = {
  profileId: string;
  sessionId: string;
  title: string;
};

export type SessionCatalogArchiveInput = {
  profileId: string;
  sessionId: string;
  archived: boolean;
};

export type SessionCatalogDeleteInput = {
  profileId: string;
  sessionId: string;
  /** Soft-delete via metadata when Hermes sessions row cannot be removed. */
  soft?: boolean;
};

export type SessionCatalogChangedPayload = {
  profileId?: string;
  reason:
    | "session.started"
    | "turn.completed"
    | "title.changed"
    | "session.deleted"
    | "session.archived"
    | "profile.changed"
    | "manual.refresh"
    | "workspace.changed";
  at: number;
};

// @lat: [[domain/chat#Persistent mount and session catalog]]
export const SESSION_CATALOG_CHANNELS = {
  list: "session-catalog:list",
  rename: "session-catalog:rename",
  archive: "session-catalog:archive",
  delete: "session-catalog:delete",
  pin: "session-catalog:pin",
  changed: "session-catalog:changed",
} as const;

export type SessionCatalogChannel =
  (typeof SESSION_CATALOG_CHANNELS)[keyof typeof SESSION_CATALOG_CHANNELS];
