/**
 * PRD v1.4 — Session catalog reads via Runtime Sessions API.
 * Desktop must not open Hermes state.db (better-sqlite3).
 */

import { getSmcRuntimeClient } from "../copilot-runtime-client/smc-runtime-client";
import { ServeInstanceAdapter } from "../runtime-adapters/ServeInstanceAdapter";

export type ProfileSessionRow = {
  profileId: string;
  sessionId: string;
  title: string | null;
  startedAt: number;
  endedAt: number | null;
  messageCount: number;
  model: string;
  source: string;
  firstUserMessage?: string;
};

async function resolveInstanceIdForProfile(profileId: string): Promise<string | null> {
  try {
    const resolved = await ServeInstanceAdapter.resolveRef(
      profileId === "default" ? "default" : profileId,
    );
    if (resolved?.instanceId) return resolved.instanceId;
  } catch {
    /* fall through */
  }
  try {
    const list = await ServeInstanceAdapter.list();
    const match = list.find(
      (i) =>
        i.profileRef === profileId ||
        i.name === profileId ||
        (profileId === "default" && (i.profileRef === "default" || i.name === "default")),
    );
    return match?.instanceId ?? list[0]?.instanceId ?? null;
  } catch {
    return null;
  }
}

function mapSessionRow(profileId: string, raw: Record<string, unknown>): ProfileSessionRow {
  const sessionId = String(raw.id ?? raw.sessionId ?? "");
  const title = raw.title != null ? String(raw.title) : null;
  const startedAt = Number(raw.created_at ?? raw.startedAt ?? raw.createdAt ?? Date.now());
  const endedAtRaw = raw.ended_at ?? raw.endedAt ?? null;
  return {
    profileId,
    sessionId,
    title,
    startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
    endedAt: endedAtRaw == null ? null : Number(endedAtRaw),
    messageCount: Number(raw.message_count ?? raw.messageCount ?? 0),
    model: String(raw.model ?? ""),
    source: String(raw.source ?? "runtime"),
    firstUserMessage: raw.first_user_message
      ? String(raw.first_user_message)
      : undefined,
  };
}

export function listKnownProfileIds(): string[] {
  // Profiles are Runtime-owned; UI may still pass default until Profiles API is wired.
  return ["default"];
}

// @lat: [[domain/chat#Persistent mount and session catalog]]
export async function readSessionsForProfileAsync(
  profileId: string,
  limit = 200,
): Promise<{ rows: ProfileSessionRow[]; unavailable: boolean }> {
  try {
    const instanceId = await resolveInstanceIdForProfile(profileId);
    if (!instanceId) return { rows: [], unavailable: true };
    const sessions = (await getSmcRuntimeClient().sessions.listByInstance(instanceId)) as Array<
      Record<string, unknown>
    >;
    const rows = sessions
      .slice(0, limit)
      .map((s) => mapSessionRow(profileId, s))
      .filter((r) => r.sessionId);
    return { rows, unavailable: false };
  } catch (err) {
    console.error("[session-catalog] Runtime sessions list failed:", err);
    return { rows: [], unavailable: true };
  }
}

/** Sync wrapper kept for existing callers — returns empty when Runtime not ready (no state.db). */
export function readSessionsForProfile(
  profileId: string,
  _limit = 200,
): { rows: ProfileSessionRow[]; unavailable: boolean } {
  void profileId;
  return { rows: [], unavailable: true };
}

export async function searchSessionsForProfileAsync(
  profileId: string,
  query: string,
): Promise<ProfileSessionRow[]> {
  try {
    const instanceId = await resolveInstanceIdForProfile(profileId);
    if (!instanceId) return [];
    const sessions = (await getSmcRuntimeClient().sessions.search(
      instanceId,
      query,
    )) as Array<Record<string, unknown>>;
    return sessions.map((s) => mapSessionRow(profileId, s)).filter((r) => r.sessionId);
  } catch {
    return [];
  }
}

export function searchSessionsForProfile(
  profileId: string,
  _query: string,
): ProfileSessionRow[] {
  void profileId;
  return [];
}
