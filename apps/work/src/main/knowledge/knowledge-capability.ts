/**
 * Cached Knowledge service capability probe. Never falls back to mock on failure.
 */

import type { KnowledgeCapabilitySnapshot } from "../../shared/knowledge/knowledge-job-ipc";
import { getKnowledgeHttpProvider } from "./knowledge-http-provider";

export type KnowledgeCapabilityStatusEx =
  KnowledgeCapabilitySnapshot["status"] | "auth_required";

export interface KnowledgeCapabilitySnapshotEx extends KnowledgeCapabilitySnapshot {
  status: KnowledgeCapabilityStatusEx;
}

let cache: KnowledgeCapabilitySnapshotEx = {
  available: false,
  status: "blocked_provider_unavailable",
};
let inFlight: Promise<KnowledgeCapabilitySnapshotEx> | null = null;

export function getCachedKnowledgeCapability(): KnowledgeCapabilitySnapshotEx {
  return cache;
}

export function isKnowledgeProviderAvailable(): boolean {
  return cache.available;
}

export async function refreshKnowledgeCapability(): Promise<KnowledgeCapabilitySnapshotEx> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const next = await getKnowledgeHttpProvider().probeCapability();
      cache = next;
      return cache;
    } catch {
      cache = { available: false, status: "blocked_provider_unavailable" };
      return cache;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export async function ensureKnowledgeCapability(): Promise<KnowledgeCapabilitySnapshotEx> {
  // Always re-probe. A startup miss (token not hydrated yet) must not latch
  // unavailable for the rest of the session.
  return refreshKnowledgeCapability();
}

export function resetKnowledgeCapabilityForTests(): void {
  cache = { available: false, status: "blocked_provider_unavailable" };
  inFlight = null;
}

export function setKnowledgeCapabilityForTests(
  snapshot: KnowledgeCapabilitySnapshotEx,
): void {
  cache = snapshot;
}
