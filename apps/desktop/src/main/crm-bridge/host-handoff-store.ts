import { randomUUID } from "crypto";
import type {
  HostBridgeSubmitEvent,
  HostHandoffRecord,
  HostHandoffStatus,
} from "../../shared/crm-bridge/host-bridge-contract";

const DEFAULT_TTL_MS = 120_000;

const handoffs = new Map<string, HostHandoffRecord>();
const handoffsByRequestId = new Map<string, string>();
const handoffsByNormalizedUrl = new Map<string, Set<string>>();

export function normalizeHostUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    return `${parsed.origin}${pathname}${parsed.search}`;
  } catch {
    return trimmed;
  }
}

function cleanupExpiredHandoffs(): void {
  const now = Date.now();
  for (const [handoffId, handoff] of handoffs.entries()) {
    if (Date.parse(handoff.expiresAt) <= now) {
      removeHostHandoff(handoffId);
    }
  }
}

function indexHandoff(handoff: HostHandoffRecord): void {
  handoffsByRequestId.set(handoff.requestId, handoff.handoffId);

  const normalized = normalizeHostUrl(handoff.callbackUrl);
  let ids = handoffsByNormalizedUrl.get(normalized);
  if (!ids) {
    ids = new Set();
    handoffsByNormalizedUrl.set(normalized, ids);
  }
  ids.add(handoff.handoffId);
}

function unindexHandoff(handoff: HostHandoffRecord): void {
  handoffsByRequestId.delete(handoff.requestId);
  const normalized = normalizeHostUrl(handoff.callbackUrl);
  const ids = handoffsByNormalizedUrl.get(normalized);
  if (!ids) return;
  ids.delete(handoff.handoffId);
  if (ids.size === 0) {
    handoffsByNormalizedUrl.delete(normalized);
  }
}

export function createHostHandoff(input: {
  sourceEvent: HostBridgeSubmitEvent;
  fillFormPayload: HostHandoffRecord["fillFormPayload"];
  skillName?: string;
  tabId?: string;
  ttlMs?: number;
}): HostHandoffRecord {
  cleanupExpiredHandoffs();

  const callbackUrl = input.sourceEvent.callbackUrl ?? "";
  const now = new Date();
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;

  let callbackOrigin = "";
  try {
    callbackOrigin = new URL(callbackUrl).origin;
  } catch {
    callbackOrigin = "";
  }

  const handoff: HostHandoffRecord = {
    handoffId: randomUUID(),
    requestId: input.sourceEvent.requestId,
    tabId: input.tabId,
    formType: input.sourceEvent.formType,
    action: input.sourceEvent.action as "create" | "edit",
    callbackUrl,
    callbackOrigin,
    skillName: input.skillName ?? input.sourceEvent.skillName,
    sourceEvent: input.sourceEvent,
    fillFormPayload: input.fillFormPayload,
    status: "pending",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };

  handoffs.set(handoff.handoffId, handoff);
  indexHandoff(handoff);
  return handoff;
}

export function getHostHandoff(handoffId: string): HostHandoffRecord | null {
  cleanupExpiredHandoffs();
  return handoffs.get(handoffId) ?? null;
}

export function findHostHandoffByRequestId(requestId: string): HostHandoffRecord | null {
  cleanupExpiredHandoffs();
  const handoffId = handoffsByRequestId.get(requestId);
  if (!handoffId) return null;
  return handoffs.get(handoffId) ?? null;
}

export function findPendingHostHandoffByUrl(url: string): HostHandoffRecord | null {
  cleanupExpiredHandoffs();
  const normalizedUrl = normalizeHostUrl(url);
  const ids = handoffsByNormalizedUrl.get(normalizedUrl);
  if (!ids || ids.size === 0) return null;

  for (const handoffId of ids) {
    const handoff = handoffs.get(handoffId);
    if (!handoff) continue;
    if (
      handoff.status === "delivered" ||
      handoff.status === "failed" ||
      handoff.status === "expired"
    ) {
      continue;
    }
    return handoff;
  }
  return null;
}

export function listHostHandoffs(limit = 20): HostHandoffRecord[] {
  cleanupExpiredHandoffs();
  return Array.from(handoffs.values())
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

export function getLastHostHandoff(): HostHandoffRecord | null {
  const list = listHostHandoffs(1);
  return list[0] ?? null;
}

export function markHostHandoffStatus(
  handoffId: string,
  status: HostHandoffStatus,
  lastError?: string,
  patch?: Partial<Pick<HostHandoffRecord, "tabId" | "commandId" | "ack">>,
): HostHandoffRecord | null {
  const handoff = handoffs.get(handoffId);
  if (!handoff) return null;

  handoff.status = status;
  handoff.updatedAt = new Date().toISOString();
  if (lastError !== undefined) {
    handoff.lastError = lastError;
  }
  if (patch?.tabId) handoff.tabId = patch.tabId;
  if (patch?.commandId) handoff.commandId = patch.commandId;
  if (patch?.ack) handoff.ack = patch.ack;

  if (status === "delivered" || status === "failed" || status === "expired") {
    unindexHandoff(handoff);
  }

  return handoff;
}

export function removeHostHandoff(handoffId: string): void {
  const handoff = handoffs.get(handoffId);
  if (!handoff) return;
  unindexHandoff(handoff);
  handoffs.delete(handoffId);
}

export function clearLatestHostHandoff(): void {
  const latest = getLastHostHandoff();
  if (latest) {
    removeHostHandoff(latest.handoffId);
  }
}
