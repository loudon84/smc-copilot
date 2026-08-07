import type { CrmBridgeStoredEvent } from "../../shared/crm-bridge/crm-bridge-contract";

const MAX_EVENTS = 100;

const events: CrmBridgeStoredEvent[] = [];
const seenRequestIds = new Map<string, number>();
const REQUEST_ID_TTL_MS = 60_000;

function pruneRequestIds(): void {
  const now = Date.now();
  for (const [id, ts] of seenRequestIds.entries()) {
    if (now - ts > REQUEST_ID_TTL_MS) {
      seenRequestIds.delete(id);
    }
  }
}

export function hasDuplicateRequestId(requestId: string): boolean {
  pruneRequestIds();
  return seenRequestIds.has(requestId);
}

export function markRequestId(requestId: string): void {
  seenRequestIds.set(requestId, Date.now());
}

export function insertCrmBridgeEvent(event: CrmBridgeStoredEvent): void {
  events.unshift(event);
  if (events.length > MAX_EVENTS) {
    events.length = MAX_EVENTS;
  }
}

export function listCrmBridgeEvents(limit = 20): CrmBridgeStoredEvent[] {
  return events.slice(0, Math.max(1, Math.min(limit, MAX_EVENTS)));
}

export function getLastCrmBridgeEvent(): CrmBridgeStoredEvent | null {
  return events[0] ?? null;
}

export function clearCrmBridgeEvents(): void {
  events.length = 0;
}
