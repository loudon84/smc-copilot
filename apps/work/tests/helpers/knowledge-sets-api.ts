import { vi } from "vitest";
import type {
  HermesKnowledgeSetsAPI,
  KnowledgeRetrievalProfileSnapshot,
  KnowledgeSetSnapshot,
} from "../../src/shared/knowledge/knowledge-set-ipc";

export function makeSetsApi(
  store: KnowledgeSetSnapshot[],
  extras: {
    profiles?: KnowledgeRetrievalProfileSnapshot[];
  } = {},
): HermesKnowledgeSetsAPI {
  const profiles = extras.profiles ?? [];

  return {
    list: vi.fn(async () => ({
      items: [...store],
      total: store.length,
      page: 1,
      pageSize: 50,
    })),
    get: vi.fn(async ({ knowledgeSetId }) => {
      const found = store.find((item) => item.id === knowledgeSetId);
      if (!found) throw new Error("KNOWLEDGE_NOT_FOUND");
      return {
        ...found,
        knowledgeBases: [...found.knowledgeBases],
      };
    }),
    create: vi.fn(async (input) => {
      const created: KnowledgeSetSnapshot = {
        id: `s${store.length + 1}`,
        name: input.name,
        description: input.description ?? null,
        status: "active",
        visibility: input.visibility ?? "organization",
        usageCount: 0,
        knowledgeBases: [],
      };
      store.push(created);
      return { ...created, knowledgeBases: [] };
    }),
    update: vi.fn(async (input) => {
      const existing = store.find((item) => item.id === input.knowledgeSetId);
      if (!existing) throw new Error("KNOWLEDGE_NOT_FOUND");
      if (input.name !== undefined) existing.name = input.name;
      if (input.description !== undefined) {
        existing.description = input.description;
      }
      if (input.status !== undefined) existing.status = input.status;
      if (input.visibility !== undefined) {
        existing.visibility = input.visibility;
      }
      return {
        ...existing,
        knowledgeBases: [...existing.knowledgeBases],
      };
    }),
    bindBase: vi.fn(async (input) => {
      const existing = store.find((item) => item.id === input.knowledgeSetId);
      if (!existing) throw new Error("KNOWLEDGE_NOT_FOUND");
      const next = existing.knowledgeBases.filter(
        (row) => row.knowledgeBaseId !== input.knowledgeBaseId,
      );
      next.push({
        knowledgeBaseId: input.knowledgeBaseId,
        weight: input.weight ?? 1,
      });
      existing.knowledgeBases = next;
      return {
        ...existing,
        knowledgeBases: [...existing.knowledgeBases],
      };
    }),
    unbindBase: vi.fn(async (input) => {
      const existing = store.find((item) => item.id === input.knowledgeSetId);
      if (!existing) throw new Error("KNOWLEDGE_NOT_FOUND");
      existing.knowledgeBases = existing.knowledgeBases.filter(
        (row) => row.knowledgeBaseId !== input.knowledgeBaseId,
      );
      return {
        ...existing,
        knowledgeBases: [...existing.knowledgeBases],
      };
    }),
    listProfiles: vi.fn(async ({ knowledgeSetId }) =>
      profiles
        .filter((item) => item.knowledgeSetId === knowledgeSetId)
        .map((item) => ({ ...item, config: { ...item.config } })),
    ),
    createProfile: vi.fn(async (input) => {
      const created: KnowledgeRetrievalProfileSnapshot = {
        id: `p${profiles.length + 1}`,
        knowledgeSetId: input.knowledgeSetId,
        version: profiles.filter((p) => p.knowledgeSetId === input.knowledgeSetId)
          .length + 1,
        config: { ...(input.config ?? {}) },
        status: "draft",
      };
      profiles.push(created);
      return { ...created, config: { ...created.config } };
    }),
    getProfile: vi.fn(async ({ profileId }) => {
      const found = profiles.find((item) => item.id === profileId);
      if (!found) throw new Error("KNOWLEDGE_NOT_FOUND");
      return { ...found, config: { ...found.config } };
    }),
    updateProfile: vi.fn(async (input) => {
      const found = profiles.find((item) => item.id === input.profileId);
      if (!found) throw new Error("KNOWLEDGE_NOT_FOUND");
      found.config = { ...input.config };
      return { ...found, config: { ...found.config } };
    }),
    publishProfile: vi.fn(async ({ profileId }) => {
      const found = profiles.find((item) => item.id === profileId);
      if (!found) throw new Error("KNOWLEDGE_NOT_FOUND");
      for (const profile of profiles) {
        if (
          profile.knowledgeSetId === found.knowledgeSetId &&
          profile.status === "active"
        ) {
          profile.status = "archived";
        }
      }
      found.status = "active";
      return { ...found, config: { ...found.config } };
    }),
    rollbackProfile: vi.fn(async (input) => {
      const found = profiles.find((item) => item.id === input.profileId);
      if (!found) throw new Error("KNOWLEDGE_NOT_FOUND");
      const rolled: KnowledgeRetrievalProfileSnapshot = {
        id: `p${profiles.length + 1}`,
        knowledgeSetId: found.knowledgeSetId,
        version:
          profiles.filter((p) => p.knowledgeSetId === found.knowledgeSetId)
            .length + 1,
        config: { ...found.config },
        status: input.publish ? "active" : "draft",
      };
      if (input.publish) {
        for (const profile of profiles) {
          if (
            profile.knowledgeSetId === found.knowledgeSetId &&
            profile.status === "active"
          ) {
            profile.status = "archived";
          }
        }
      }
      profiles.push(rolled);
      return { ...rolled, config: { ...rolled.config } };
    }),
  };
}
