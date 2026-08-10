/**
 * PRD v1.6 FR-10 — Desktop must not open Hermes state.db.
 * Session reads go through Runtime Sessions API (ChatCapabilityRuntime).
 * Sync helpers remain for legacy IPC signatures but return empty (fail closed).
 */

import { getSmcRuntimeClient } from "./copilot-runtime-client/smc-runtime-client";
import { ChatCapabilityRuntime } from "./runtime-adapters/ChatCapabilityRuntime";

export interface SessionSummary {
  id: string;
  source: string;
  startedAt: number;
  endedAt: number | null;
  messageCount: number;
  model: string;
  title: string | null;
  preview: string;
}

export interface SessionMessage {
  id: number;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
}

export interface SearchResult {
  sessionId: string;
  title: string | null;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  snippet: string;
}

/** @deprecated Sync state.db path removed — returns empty. Use listSessionsAsync. */
export function listSessions(_limit = 30, _offset = 0): SessionSummary[] {
  return [];
}

/** @deprecated Sync state.db path removed — returns empty. Use getSessionMessagesAsync. */
export function getSessionMessages(_sessionId: string): SessionMessage[] {
  return [];
}

/** @deprecated Sync state.db path removed — returns empty. Use searchSessionsAsync. */
export function searchSessions(_query: string, _limit = 20): SearchResult[] {
  return [];
}

function mapSummary(raw: Record<string, unknown>): SessionSummary {
  return {
    id: String(raw.id ?? raw.sessionId ?? ""),
    source: String(raw.source ?? "runtime"),
    startedAt: Number(raw.created_at ?? raw.startedAt ?? raw.createdAt ?? Date.now()),
    endedAt:
      raw.ended_at == null && raw.endedAt == null
        ? null
        : Number(raw.ended_at ?? raw.endedAt),
    messageCount: Number(raw.message_count ?? raw.messageCount ?? 0),
    model: String(raw.model ?? ""),
    title: raw.title != null ? String(raw.title) : null,
    preview: String(raw.preview ?? ""),
  };
}

function mapMessage(raw: Record<string, unknown>, index: number): SessionMessage {
  const roleRaw = String(raw.role ?? "assistant");
  const role: SessionMessage["role"] =
    roleRaw === "user" || roleRaw === "tool" ? roleRaw : "assistant";
  return {
    id: Number(raw.id ?? index),
    role,
    content: String(raw.content ?? ""),
    timestamp: Number(raw.timestamp ?? raw.created_at ?? Date.now()),
  };
}

export async function listSessionsAsync(
  limit = 30,
  offset = 0,
  profileRef?: string,
): Promise<SessionSummary[]> {
  const rows = (await ChatCapabilityRuntime.listSessions(profileRef)) as Array<
    Record<string, unknown>
  >;
  return rows.slice(offset, offset + limit).map(mapSummary).filter((s) => s.id);
}

export async function getSessionMessagesAsync(
  sessionId: string,
  profileRef?: string,
): Promise<SessionMessage[]> {
  const rows = (await ChatCapabilityRuntime.listMessages(
    sessionId,
    profileRef,
  )) as Array<Record<string, unknown>>;
  return rows.map(mapMessage);
}

export async function searchSessionsAsync(
  query: string,
  limit = 20,
  profileRef?: string,
): Promise<SearchResult[]> {
  const instanceId = await ChatCapabilityRuntime.resolveInstanceId(profileRef);
  if (!instanceId) return [];
  const rows = (await getSmcRuntimeClient().sessions.search(
    instanceId,
    query,
  )) as Array<Record<string, unknown>>;
  return rows.slice(0, limit).map((raw) => ({
    sessionId: String(raw.id ?? raw.sessionId ?? ""),
    title: raw.title != null ? String(raw.title) : null,
    startedAt: Number(raw.created_at ?? raw.startedAt ?? Date.now()),
    source: String(raw.source ?? "runtime"),
    messageCount: Number(raw.message_count ?? raw.messageCount ?? 0),
    model: String(raw.model ?? ""),
    snippet: String(raw.snippet ?? raw.preview ?? ""),
  }));
}
