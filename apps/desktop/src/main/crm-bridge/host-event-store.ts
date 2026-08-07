import type {
  HostBridgeStoredEvent,
  HostBridgeStoredReadyEvent,
} from "../../shared/crm-bridge/host-bridge-contract";

const MAX_EVENTS = 100;

const submitEvents: HostBridgeStoredEvent[] = [];
const readyEvents: HostBridgeStoredReadyEvent[] = [];
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

export function hasDuplicateHostRequestId(requestId: string): boolean {
  pruneRequestIds();
  return seenRequestIds.has(requestId);
}

export function markHostRequestId(requestId: string): void {
  seenRequestIds.set(requestId, Date.now());
}

export function insertHostBridgeSubmitEvent(event: HostBridgeStoredEvent): void {
  submitEvents.unshift(event);
  if (submitEvents.length > MAX_EVENTS) {
    submitEvents.length = MAX_EVENTS;
  }
}

export function insertHostBridgeReadyEvent(event: HostBridgeStoredReadyEvent): void {
  readyEvents.unshift(event);
  if (readyEvents.length > MAX_EVENTS) {
    readyEvents.length = MAX_EVENTS;
  }
}

export function listHostBridgeEvents(limit = 20): HostBridgeStoredEvent[] {
  return submitEvents.slice(0, Math.max(1, Math.min(limit, MAX_EVENTS)));
}

export function getLastHostBridgeEvent(): HostBridgeStoredEvent | null {
  return submitEvents[0] ?? null;
}

export function getLastHostBridgeReadyEvent(): HostBridgeStoredReadyEvent | null {
  return readyEvents[0] ?? null;
}
