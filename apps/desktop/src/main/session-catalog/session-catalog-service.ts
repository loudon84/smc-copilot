/**
 * v8.2 — Unified Session Catalog service.
 */

import type {
  SessionCatalogArchiveInput,
  SessionCatalogDeleteInput,
  SessionCatalogDraftItem,
  SessionCatalogItem,
  SessionCatalogListResult,
  SessionCatalogQuery,
  SessionCatalogRenameInput,
  SessionCatalogStatus,
} from "../../shared/session-catalog/session-catalog-contract";
import { DEFAULT_CHAT_WORKSPACE_ID } from "../../shared/chat-workspace/chat-workspace-contract";
import * as workspaceStore from "../chat-workspace/chat-workspace-store";
import { getRun } from "../chat-runtime/chat-runtime-store";
import {
  listKnownProfileIds,
  readSessionsForProfileAsync,
  searchSessionsForProfileAsync,
  type ProfileSessionRow,
} from "./session-catalog-profile-reader";
import {
  deleteSessionMetadata,
  getSessionMetadata,
  listAllSessionMetadata,
  upsertSessionMetadata,
} from "./session-catalog-store";
import { emitSessionCatalogChanged } from "./session-catalog-events";

function resolveTitle(
  row: ProfileSessionRow,
  customTitle: string | null | undefined,
): string {
  if (customTitle && customTitle.trim()) return customTitle.trim();
  if (row.title && row.title.trim()) return row.title.trim();
  if (row.firstUserMessage && row.firstUserMessage.trim()) {
    return row.firstUserMessage.trim().slice(0, 40);
  }
  return "New Chat";
}

function deriveStatus(
  row: ProfileSessionRow,
  linkedRunId?: string,
): SessionCatalogStatus {
  if (linkedRunId) {
    try {
      const runtime = getRun(linkedRunId);
      if (runtime) {
        if (runtime.status === "waiting_approval") return "waiting_approval";
        if (runtime.status === "waiting_clarify") return "waiting_clarify";
        if (
          runtime.status === "starting" ||
          runtime.status === "streaming"
        ) {
          return "active";
        }
        if (runtime.status === "failed") return "failed";
        if (
          runtime.status === "cancelled" ||
          runtime.status === "interrupted"
        ) {
          return "interrupted";
        }
      }
    } catch {
      /* store may be memory-only */
    }
  }
  void row;
  return "completed";
}

function toItem(
  row: ProfileSessionRow,
  meta: ReturnType<typeof getSessionMetadata>,
  linkedRunId?: string,
): SessionCatalogItem {
  return {
    profileId: row.profileId,
    sessionId: row.sessionId,
    title: resolveTitle(row, meta?.customTitle),
    startedAt: row.startedAt,
    updatedAt: meta?.updatedAt ?? row.startedAt,
    messageCount: row.messageCount,
    model: row.model || undefined,
    source: row.source || undefined,
    status: deriveStatus(row, linkedRunId),
    linkedRunId,
    pinned: meta?.pinned ?? false,
    archived: meta?.archived ?? false,
  };
}

// @lat: [[domain/chat#Persistent mount and session catalog]]
export async function listSessions(
  query: SessionCatalogQuery = {},
): Promise<SessionCatalogListResult> {
  const profileFilter = query.profileId && query.profileId !== "all"
    ? [query.profileId]
    : listKnownProfileIds();
  const profilesUnavailable: string[] = [];
  const metaAll = listAllSessionMetadata();
  const metaMap = new Map<string, (typeof metaAll)[number]>();
  for (const m of metaAll) {
    metaMap.set(`${m.profileId}::${m.sessionId}`, m);
  }

  const workspaceRuns = workspaceStore.listOpenRuns(DEFAULT_CHAT_WORKSPACE_ID);
  const linkedBySession = new Map<string, string>();
  for (const run of workspaceRuns) {
    if (run.sessionId) {
      linkedBySession.set(`${run.profileId}::${run.sessionId}`, run.runId);
    }
  }

  let rows: ProfileSessionRow[] = [];
  const search = query.search?.trim();
  for (const profileId of profileFilter) {
    if (search) {
      rows.push(...(await searchSessionsForProfileAsync(profileId, search)));
    } else {
      const { rows: profileRows, unavailable } = await readSessionsForProfileAsync(
        profileId,
        query.limit ?? 200,
      );
      if (unavailable) profilesUnavailable.push(profileId);
      rows.push(...profileRows);
    }
  }

  let items = rows.map((row) => {
    const key = `${row.profileId}::${row.sessionId}`;
    return toItem(row, metaMap.get(key) ?? null, linkedBySession.get(key));
  });

  if (!query.includeArchived) {
    items = items.filter((i) => !i.archived);
  }
  if (query.status && query.status !== "all") {
    items = items.filter((i) => i.status === query.status);
  }

  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.startedAt - a.startedAt;
  });

  const offset = query.offset ?? 0;
  const limit = query.limit ?? 80;
  const total = items.length;
  items = items.slice(offset, offset + limit);

  let drafts: SessionCatalogDraftItem[] = [];
  if (query.includeDrafts !== false) {
    drafts = workspaceStore
      .listDraftRuns(DEFAULT_CHAT_WORKSPACE_ID)
      .filter((r) => {
        if (query.profileId && query.profileId !== "all") {
          return r.profileId === query.profileId;
        }
        return true;
      })
      .map((r) => ({
        runId: r.runId,
        workspaceId: r.workspaceId,
        profileId: r.profileId,
        title: r.title,
        draft: r.draft,
        updatedAt: r.updatedAt,
        modelId: r.modelId,
      }));
  }

  return {
    items,
    drafts,
    total,
    profilesUnavailable,
    error:
      profilesUnavailable.length === profileFilter.length && profileFilter.length > 0
        ? "Session database unavailable"
        : undefined,
  };
}

export async function renameSession(
  input: SessionCatalogRenameInput,
): Promise<SessionCatalogItem | null> {
  upsertSessionMetadata(input.profileId, input.sessionId, {
    customTitle: input.title.trim(),
  });
  // Also patch linked workspace run title
  const linked = workspaceStore.findRunBySession(
    input.profileId,
    input.sessionId,
  );
  if (linked) {
    workspaceStore.updateRunFields(linked.runId, {
      title: input.title.trim(),
      titleSource: "user",
    });
  }
  notifyChanged(input.profileId, "title.changed");
  const listed = await listSessions({
    profileId: input.profileId,
    includeArchived: true,
    includeDrafts: false,
    limit: 500,
  });
  return (
    listed.items.find((i) => i.sessionId === input.sessionId) ?? null
  );
}

export function archiveSession(input: SessionCatalogArchiveInput): void {
  upsertSessionMetadata(input.profileId, input.sessionId, {
    archived: input.archived,
  });
  notifyChanged(input.profileId, "session.archived");
}

export function deleteSession(input: SessionCatalogDeleteInput): void {
  if (input.soft !== false) {
    upsertSessionMetadata(input.profileId, input.sessionId, {
      archived: true,
    });
  } else {
    deleteSessionMetadata(input.profileId, input.sessionId);
  }
  const linked = workspaceStore.findRunBySession(
    input.profileId,
    input.sessionId,
  );
  if (linked) {
    workspaceStore.closeRun(linked.runId);
  }
  notifyChanged(input.profileId, "session.deleted");
}

export function pinSession(
  profileId: string,
  sessionId: string,
  pinned: boolean,
): void {
  upsertSessionMetadata(profileId, sessionId, { pinned });
  notifyChanged(profileId, "title.changed");
}

export function notifyChanged(
  profileId: string | undefined,
  reason: Parameters<typeof emitSessionCatalogChanged>[0]["reason"],
): void {
  emitSessionCatalogChanged({ profileId, reason });
}
