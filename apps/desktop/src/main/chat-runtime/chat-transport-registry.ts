/** v8.1 — Transport Handle registry (network abort only; durable run state lives elsewhere). */

import type { ChatTransportHandle } from "../../shared/chat-runtime/chat-runtime-state";

const transports = new Map<string, ChatTransportHandle>();

function key(runId: string, turnId: string): string {
  return `${runId}::${turnId}`;
}

export function setTransportHandle(handle: ChatTransportHandle): void {
  const k = key(handle.runId, handle.turnId);
  const previous = transports.get(k);
  if (previous && previous !== handle) {
    try {
      previous.abort();
    } catch {
      /* best effort */
    }
  }
  transports.set(k, handle);
}

export function getTransportHandle(
  runId: string,
  turnId: string,
): ChatTransportHandle | undefined {
  return transports.get(key(runId, turnId));
}

export function clearTransportHandle(runId: string, turnId: string): void {
  transports.delete(key(runId, turnId));
}

export function abortTransport(runId: string, turnId?: string): boolean {
  if (turnId) {
    const handle = transports.get(key(runId, turnId));
    if (!handle) return false;
    try {
      handle.abort();
    } catch {
      /* best effort */
    }
    transports.delete(key(runId, turnId));
    return true;
  }
  let any = false;
  for (const [k, handle] of transports) {
    if (!k.startsWith(`${runId}::`)) continue;
    try {
      handle.abort();
    } catch {
      /* best effort */
    }
    transports.delete(k);
    any = true;
  }
  return any;
}

export function abortAllTransports(): void {
  for (const [k, handle] of transports) {
    try {
      handle.abort();
    } catch {
      /* best effort */
    }
    transports.delete(k);
  }
}

export function __resetTransportRegistryForTests(): void {
  transports.clear();
}
