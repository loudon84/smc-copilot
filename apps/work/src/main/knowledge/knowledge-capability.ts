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
let epoch = 0;

/** Identity changes must not reuse a probe made for the previous account/profile. */
export function invalidateKnowledgeCapability(): void {
  epoch++;
  cache = { available: false, status: "blocked_provider_unavailable" };
  inFlight = null;
}

export function getCachedKnowledgeCapability(): KnowledgeCapabilitySnapshotEx {
  return cache;
}

export function isKnowledgeProviderAvailable(): boolean {
  return cache.available;
}

export async function refreshKnowledgeCapability(): Promise<KnowledgeCapabilitySnapshotEx> {
  if (inFlight) return inFlight;
  const probeEpoch = epoch;
  inFlight = (async () => {
    try {
      const next = await getKnowledgeHttpProvider().probeCapability();
      if (probeEpoch === epoch) cache = next;
      return cache;
    } catch {
      if (probeEpoch === epoch)
        cache = { available: false, status: "blocked_provider_unavailable" };
      return cache;
    } finally {
      if (probeEpoch === epoch) inFlight = null;
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
  invalidateKnowledgeCapability();
}

export function setKnowledgeCapabilityForTests(
  snapshot: KnowledgeCapabilitySnapshotEx,
): void {
  cache = snapshot;
}
