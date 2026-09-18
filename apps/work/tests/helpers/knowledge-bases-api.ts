import { vi } from "vitest";
import type {
  HermesKnowledgeBasesAPI,
  KnowledgeBaseFileSnapshot,
  KnowledgeBaseSnapshot,
  KnowledgeBuildJobSnapshot,
  KnowledgeFileVersionSnapshot,
  KnowledgeIndexState,
} from "../../src/shared/knowledge/knowledge-base-ipc";

export function unusedKnowledgeBaseOps(
  overrides: Partial<HermesKnowledgeBasesAPI> = {},
): Pick<
  HermesKnowledgeBasesAPI,
  | "getFile"
  | "listFileVersions"
  | "addFileVersion"
  | "activateFileVersion"
  | "archiveFile"
  | "unarchiveFile"
  | "reparseFile"
  | "deleteFile"
  | "resolveDocumentPreview"
  | "listIndexes"
  | "getBuildProfile"
  | "updateBuildProfile"
  | "startBuild"
  | "getBuild"
  | "retryBuild"
  | "watchBuild"
  | "unwatchBuild"
  | "onBuildChanged"
> {
  const unused = async (): Promise<never> => {
    throw new Error("unused");
  };
  return {
    getFile: vi.fn(unused),
    listFileVersions: vi.fn(async () => []),
    addFileVersion: vi.fn(unused),
    activateFileVersion: vi.fn(unused),
    archiveFile: vi.fn(unused),
    unarchiveFile: vi.fn(unused),
    reparseFile: vi.fn(unused),
    deleteFile: vi.fn(async () => undefined),
    resolveDocumentPreview: vi.fn(unused),
    listIndexes: vi.fn(async () => []),
    getBuildProfile: vi.fn(async () => ({
      activeBuildProfileId: null,
      profileId: "default",
      profileName: "Default",
    })),
    updateBuildProfile: vi.fn(unused),
    startBuild: vi.fn(async () => ({
      id: "build-unused",
      status: "completed",
      progress: 100,
    })),
    getBuild: vi.fn(unused),
    retryBuild: vi.fn(unused),
    watchBuild: vi.fn(unused),
    unwatchBuild: vi.fn(async () => undefined),
    onBuildChanged: () => () => undefined,
    ...overrides,
  };
}

export function makeBasesApi(
  store: KnowledgeBaseSnapshot[],
  extras: {
    files?: KnowledgeBaseFileSnapshot[];
    versions?: KnowledgeFileVersionSnapshot[];
    indexes?: KnowledgeIndexState[];
    startBuild?: () => Promise<KnowledgeBuildJobSnapshot>;
  } = {},
): HermesKnowledgeBasesAPI {
  const files = extras.files ?? [];
  return {
    list: vi.fn(async () => ({
      items: [...store],
      total: store.length,
      page: 1,
      pageSize: 50,
    })),
    get: vi.fn(async ({ knowledgeBaseId }) => {
      const found = store.find((item) => item.id === knowledgeBaseId);
      if (!found) throw new Error("KNOWLEDGE_NOT_FOUND");
      return found;
    }),
    create: vi.fn(async (input) => {
      const created: KnowledgeBaseSnapshot = {
        id: `b${store.length + 1}`,
        name: input.name,
        description: input.description ?? null,
        status: "active",
        visibility: input.visibility ?? "private",
      };
      store.push(created);
      return created;
    }),
    update: vi.fn(async (input) => {
      const existing = store.find((item) => item.id === input.knowledgeBaseId)!;
      existing.name = input.name ?? existing.name;
      existing.description =
        input.description === undefined ? existing.description : input.description;
      existing.visibility = input.visibility ?? existing.visibility;
      return existing;
    }),
    delete: vi.fn(async ({ knowledgeBaseId }) => {
      const index = store.findIndex((item) => item.id === knowledgeBaseId);
      if (index >= 0) store.splice(index, 1);
    }),
    listFiles: vi.fn(async ({ knowledgeBaseId }) => {
      const items = files.filter((file) => file.knowledgeBaseId === knowledgeBaseId);
      return {
        items: [...items],
        total: items.length,
        page: 1,
        pageSize: 50,
      };
    }),
    ...unusedKnowledgeBaseOps({
      getFile: vi.fn(async ({ sourceFileId }) => {
        const file = files.find((item) => item.id === sourceFileId);
        if (!file) throw new Error("KNOWLEDGE_NOT_FOUND");
        return { ...file };
      }),
      listFileVersions: vi.fn(async () => extras.versions ?? []),
      activateFileVersion: vi.fn(async ({ sourceFileId, versionId }) => {
        const file = files.find((item) => item.id === sourceFileId);
        if (!file) throw new Error("KNOWLEDGE_NOT_FOUND");
        file.activeVersionId = versionId;
        return { ...file };
      }),
      archiveFile: vi.fn(async ({ sourceFileId }) => {
        const file = files.find((item) => item.id === sourceFileId);
        if (!file) throw new Error("KNOWLEDGE_NOT_FOUND");
        file.archivedAt = "2026-01-01T00:00:00.000Z";
        return { ...file };
      }),
      unarchiveFile: vi.fn(async ({ sourceFileId }) => {
        const file = files.find((item) => item.id === sourceFileId);
        if (!file) throw new Error("KNOWLEDGE_NOT_FOUND");
        file.archivedAt = null;
        return { ...file };
      }),
      reparseFile: vi.fn(async ({ sourceFileId }) => {
        const file = files.find((item) => item.id === sourceFileId);
        if (!file) throw new Error("KNOWLEDGE_NOT_FOUND");
        return { ...file, status: "updating" };
      }),
      listIndexes: vi.fn(async () => extras.indexes ?? []),
      startBuild: vi.fn(
        extras.startBuild ??
          (async () => ({
            id: "build-1",
            status: "completed",
            progress: 100,
            knowledgeBaseId: store[0]?.id ?? "kb",
          })),
      ),
    }),
  };
}
