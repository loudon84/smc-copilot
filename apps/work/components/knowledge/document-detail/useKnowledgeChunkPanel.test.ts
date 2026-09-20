import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import {
  useKnowledgeChunkPanel,
  validateChunkPageContract,
} from "./useKnowledgeChunkPanel";
import type { HermesKnowledgeBasesAPI } from "../../../src/shared/knowledge/knowledge-base-ipc";

function basesStub(
  overrides: Partial<HermesKnowledgeBasesAPI> = {},
): HermesKnowledgeBasesAPI {
  return {
    listFileChunks: vi.fn(async () => ({
      sourceFileId: "sf-1",
      fileVersionId: "ver-1",
      items: [
        {
          id: "c1",
          content: "hello world",
          available: true,
          positions: null,
          importantKeywords: [],
          questions: [],
          hasImage: false,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    })),
    setFileChunkAvailability: vi.fn(async (input) => ({
      sourceFileId: input.sourceFileId,
      fileVersionId: input.fileVersionId,
      chunkId: input.chunkId,
      available: input.available,
    })),
    getFileChunkImage: vi.fn(async () => ({
      mimeType: "image/png",
      bytes: new Uint8Array([1, 2, 3]),
    })),
    listFileVersions: vi.fn(async () => [
      {
        id: "ver-1",
        sourceFileId: "sf-1",
        versionNo: 1,
        parseStatus: "active" as const,
      },
    ]),
    ...overrides,
  } as unknown as HermesKnowledgeBasesAPI;
}

const baseInput = {
  sourceFileId: "sf-1",
  activeVersionId: "ver-1",
  versions: [
    {
      id: "ver-1",
      sourceFileId: "sf-1",
      versionNo: 1,
      parseStatus: "active" as const,
    },
  ],
  mutationsEnabled: true,
  syncEpoch: 0,
  reparsePending: false,
};

describe("validateChunkPageContract", () => {
  it("accepts matching six-field page", () => {
    expect(
      validateChunkPageContract({
        result: {
          sourceFileId: "sf-1",
          fileVersionId: "ver-1",
          items: [],
          total: 11,
          page: 2,
          pageSize: 10,
        },
        sourceFileId: "sf-1",
        activeVersionId: "ver-1",
        page: 2,
        pageSize: 10,
      }),
    ).toBe("ok");
  });

  it("marks version mismatch stale", () => {
    expect(
      validateChunkPageContract({
        result: {
          sourceFileId: "sf-1",
          fileVersionId: "ver-old",
          items: [],
          total: 1,
          page: 1,
          pageSize: 10,
        },
        sourceFileId: "sf-1",
        activeVersionId: "ver-1",
        page: 1,
        pageSize: 10,
      }),
    ).toBe("stale");
  });

  it("marks pageSize mismatch invalid", () => {
    expect(
      validateChunkPageContract({
        result: {
          sourceFileId: "sf-1",
          fileVersionId: "ver-1",
          items: [],
          total: 1,
          page: 1,
          pageSize: 50,
        },
        sourceFileId: "sf-1",
        activeVersionId: "ver-1",
        page: 1,
        pageSize: 10,
      }),
    ).toBe("invalid");
  });
});

describe("useKnowledgeChunkPanel", () => {
  it("defaults pageSize to 10 and loads READY when version matches", async () => {
    const bases = basesStub();
    const { result } = renderHook(() =>
      useKnowledgeChunkPanel({
        bases,
        ...baseInput,
      }),
    );

    expect(result.current.pageSize).toBe(10);
    await waitFor(() => {
      expect(result.current.state).toBe("READY");
    });
    expect(bases.listFileChunks).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 10 }),
    );
    expect(result.current.page?.items).toHaveLength(1);
  });

  it("supports multi-page navigation for total=11 pageSize=10", async () => {
    const listFileChunks = vi.fn(async (input: { page?: number; pageSize?: number }) => {
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 10;
      return {
        sourceFileId: "sf-1",
        fileVersionId: "ver-1",
        items: [
          {
            id: `c-${page}`,
            content: `page-${page}`,
            available: true,
            positions: null,
            importantKeywords: [],
            questions: [],
            hasImage: false,
          },
        ],
        total: 11,
        page,
        pageSize,
      };
    });
    const bases = basesStub({ listFileChunks });
    const { result } = renderHook(() =>
      useKnowledgeChunkPanel({
        bases,
        ...baseInput,
      }),
    );

    await waitFor(() => {
      expect(result.current.state).toBe("READY");
    });
    expect(result.current.page?.total).toBe(11);
    expect(result.current.page?.page).toBe(1);

    await act(async () => {
      result.current.goPage(2);
    });
    await waitFor(() => {
      expect(result.current.page?.page).toBe(2);
    });
    expect(listFileChunks).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 10 }),
    );
    expect(result.current.page?.items[0]?.id).toBe("c-2");
  });

  it("errors when page contract mismatches (non-version)", async () => {
    const bases = basesStub({
      listFileChunks: vi.fn(async () => ({
        sourceFileId: "sf-other",
        fileVersionId: "ver-1",
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
      })),
    });
    const { result } = renderHook(() =>
      useKnowledgeChunkPanel({
        bases,
        ...baseInput,
      }),
    );
    await waitFor(() => {
      expect(result.current.state).toBe("ERROR");
    });
    expect(result.current.errorCode).toBe("KNOWLEDGE_CONTRACT_INVALID");
  });

  it("blocks toggle when available is null", async () => {
    const bases = basesStub({
      listFileChunks: vi.fn(async () => ({
        sourceFileId: "sf-1",
        fileVersionId: "ver-1",
        items: [
          {
            id: "c1",
            content: "x",
            available: null,
            positions: null,
            importantKeywords: [],
            questions: [],
            hasImage: false,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      })),
    });
    const { result } = renderHook(() =>
      useKnowledgeChunkPanel({
        bases,
        ...baseInput,
      }),
    );

    await waitFor(() => {
      expect(result.current.state).toBe("READY");
    });
    await act(async () => {
      result.current.toggleAvailable(result.current.page!.items[0]!);
    });
    expect(bases.setFileChunkAvailability).not.toHaveBeenCalled();
  });
});
