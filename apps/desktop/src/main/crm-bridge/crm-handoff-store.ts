import { randomUUID } from "crypto";

export type PendingCrmHandoffStatus =
  | "pending"
  | "navigating"
  | "ready"
  | "delivering"
  | "delivered"
  | "failed"
  | "expired";

export type PendingCrmHandoff = {
  handoffId: string;
  targetUrl: string;
  normalizedUrl: string;
  actionKey: string;
  schema: string;
  entityType?: string;
  entityId?: string;
  data: Record<string, unknown>;
  status: PendingCrmHandoffStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  lastError?: string;
};

const DEFAULT_TTL_MS = 60_000;

const handoffs = new Map<string, PendingCrmHandoff>();
const handoffIdsByNormalizedUrl = new Map<string, Set<string>>();

export function normalizeCrmUrl(rawUrl: string): string {
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
      removeCrmHandoff(handoffId);
    }
  }
}

function indexHandoff(handoff: PendingCrmHandoff): void {
  let ids = handoffIdsByNormalizedUrl.get(handoff.normalizedUrl);
  if (!ids) {
    ids = new Set();
    handoffIdsByNormalizedUrl.set(handoff.normalizedUrl, ids);
  }
  ids.add(handoff.handoffId);
}

function unindexHandoff(handoff: PendingCrmHandoff): void {
  const ids = handoffIdsByNormalizedUrl.get(handoff.normalizedUrl);
  if (!ids) return;
  ids.delete(handoff.handoffId);
  if (ids.size === 0) {
    handoffIdsByNormalizedUrl.delete(handoff.normalizedUrl);
  }
}

export function createCrmHandoff(input: {
  targetUrl: string;
  actionKey: string;
  schema: string;
  entityType?: string;
  entityId?: string;
  data: Record<string, unknown>;
  ttlMs?: number;
}): PendingCrmHandoff {
  cleanupExpiredHandoffs();

  const now = new Date();
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  const normalizedUrl = normalizeCrmUrl(input.targetUrl);

  const handoff: PendingCrmHandoff = {
    handoffId: randomUUID(),
    targetUrl: input.targetUrl,
    normalizedUrl,
    actionKey: input.actionKey,
    schema: input.schema,
    entityType: input.entityType,
    entityId: input.entityId,
    data: input.data,
    status: "pending",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };

  handoffs.set(handoff.handoffId, handoff);
  indexHandoff(handoff);
  return handoff;
}

export function findPendingCrmHandoffByUrl(url: string): PendingCrmHandoff | null {
  cleanupExpiredHandoffs();

  const normalizedUrl = normalizeCrmUrl(url);
  const ids = handoffIdsByNormalizedUrl.get(normalizedUrl);
  if (!ids || ids.size === 0) {
    return null;
  }

  for (const handoffId of ids) {
    const handoff = handoffs.get(handoffId);
    if (!handoff) continue;
    if (handoff.status === "delivered" || handoff.status === "failed" || handoff.status === "expired") {
      continue;
    }
    return handoff;
  }

  return null;
}

export function markCrmHandoffStatus(
  handoffId: string,
  status: PendingCrmHandoffStatus,
  lastError?: string,
): PendingCrmHandoff | null {
  const handoff = handoffs.get(handoffId);
  if (!handoff) return null;

  handoff.status = status;
  handoff.updatedAt = new Date().toISOString();
  if (lastError !== undefined) {
    handoff.lastError = lastError;
  }

  if (status === "delivered" || status === "failed" || status === "expired") {
    unindexHandoff(handoff);
  }

  return handoff;
}

export function removeCrmHandoff(handoffId: string): void {
  const handoff = handoffs.get(handoffId);
  if (!handoff) return;
  unindexHandoff(handoff);
  handoffs.delete(handoffId);
}
