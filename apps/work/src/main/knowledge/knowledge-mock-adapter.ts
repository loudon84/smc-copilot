/**
 * Work-owned Mock Adapter under the Provider Facade (AC-03 / AC-04 / AC-11 / AC-13).
 * Serves synthetic bases/sets/documents/sessions/citations with display-only permission.
 * Behaviour adapted from the approved mock-repository copy source — never runtime-imported.
 */
import type {
  KnowledgeFacadeEntityKind,
  KnowledgeFacadeEntitySnapshot,
  KnowledgeFacadeGetInput,
  KnowledgeFacadeListInput,
  KnowledgeFacadeMutateInput,
  KnowledgeJobPartition,
} from "../../shared/knowledge/knowledge-job-ipc";
import {
  deleteMockEntity,
  displayPermission,
  getMockEntity,
  listMockEntities,
  seedMockFixtures,
  upsertMockEntity,
  type KnowledgeMockEntityRecord,
} from "./knowledge-mock-store";

function toSnapshot(record: KnowledgeMockEntityRecord): KnowledgeFacadeEntitySnapshot {
  return {
    id: record.id,
    kind: record.kind,
    dataMode: "mock",
    partition: record.partition,
    title: record.title,
    permission: {
      role: record.permission.role,
      visibility: record.permission.visibility,
    },
  };
}

export class KnowledgeMockAdapter {
  ensureSeeded(partition: KnowledgeJobPartition): void {
    seedMockFixtures(partition);
  }

  list(
    partition: KnowledgeJobPartition,
    input: KnowledgeFacadeListInput,
  ): KnowledgeFacadeEntitySnapshot[] {
    return listMockEntities(partition, input.kind).map(toSnapshot);
  }

  get(
    partition: KnowledgeJobPartition,
    input: KnowledgeFacadeGetInput,
  ): KnowledgeFacadeEntitySnapshot | null {
    const row = getMockEntity(partition, input.kind, input.entityId);
    return row ? toSnapshot(row) : null;
  }

  /**
   * Create or update a synthetic entity in the acting partition.
   * Returns null when entityId is set but not visible — caller maps to partition denied.
   */
  mutate(
    partition: KnowledgeJobPartition,
    input: KnowledgeFacadeMutateInput,
  ): KnowledgeFacadeEntitySnapshot | null {
    const kind = input.kind;
    const patch = input.patch ?? {};
    const title =
      typeof patch.title === "string" ? patch.title : undefined;

    if (input.entityId) {
      const existing = getMockEntity(partition, kind, input.entityId);
      if (!existing) return null;
      const updated = upsertMockEntity({
        partition,
        kind,
        entityId: input.entityId,
        title: title ?? existing.title,
        permission: displayPermission(patch),
        payload: { ...existing.payload, ...sanitizePatch(patch) },
      });
      return toSnapshot(updated);
    }

    const created = upsertMockEntity({
      partition,
      kind,
      title: title ?? `Demo ${kind}`,
      permission: displayPermission(patch),
      payload: sanitizePatch(patch),
    });
    return toSnapshot(created);
  }

  delete(
    partition: KnowledgeJobPartition,
    kind: KnowledgeFacadeEntityKind,
    entityId: string,
  ): boolean {
    return deleteMockEntity(partition, kind, entityId);
  }
}

function sanitizePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "title" || key === "role" || key === "visibility") continue;
    if (typeof value === "string") {
      // Never persist absolute paths or token-like values.
      if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith("/") || /token|secret|bearer/i.test(value)) {
        continue;
      }
      out[key] = value.slice(0, 256);
    } else if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[key] = value;
    }
  }
  return out;
}

export function createKnowledgeMockAdapter(): KnowledgeMockAdapter {
  return new KnowledgeMockAdapter();
}
