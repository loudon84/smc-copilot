import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useKnowledgeChunkPanel } from "./useKnowledgeChunkPanel";
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
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    })),
    setFileChunkAvailability: vi.fn(async (input) => ({
      sourceFileId: input.sourceFileId,
      fileVersionId: input.fileVersionId,
      chunkId: input.chunkId,
      available: input.available,
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

describe("useKnowledgeChunkPanel", () => {
  it("loads READY when version matches", async () => {
    const bases = basesStub();
    const { result } = renderHook(() =>
      useKnowledgeChunkPanel({
        bases,
        sourceFileId: "sf-1",
        activeVersionId: "ver-1",
        versions: [
          {
            id: "ver-1",
            sourceFileId: "sf-1",
            versionNo: 1,
            parseStatus: "active",
          },
        ],
        mutationsEnabled: true,
        syncEpoch: 0,
        reparsePending: false,
      }),
    );

    await waitFor(() => {
      expect(result.current.state).toBe("READY");
    });
    expect(result.current.page?.items).toHaveLength(1);
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
          },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
      })),
    });
    const { result } = renderHook(() =>
      useKnowledgeChunkPanel({
        bases,
        sourceFileId: "sf-1",
        activeVersionId: "ver-1",
        versions: [
          {
            id: "ver-1",
            sourceFileId: "sf-1",
            versionNo: 1,
            parseStatus: "active",
          },
        ],
        mutationsEnabled: true,
        syncEpoch: 0,
        reparsePending: false,
      }),
    );
    await waitFor(() => expect(result.current.state).toBe("READY"));
    act(() => {
      result.current.toggleAvailable(result.current.page!.items[0]!);
    });
    expect(bases.setFileChunkAvailability).not.toHaveBeenCalled();
  });

  it("enters WAITING_PARSE when reparsePending", async () => {
    const bases = basesStub();
    const { result } = renderHook(() =>
      useKnowledgeChunkPanel({
        bases,
        sourceFileId: "sf-1",
        activeVersionId: "ver-1",
        versions: [
          {
            id: "ver-1",
            sourceFileId: "sf-1",
            versionNo: 1,
            parseStatus: "active",
          },
        ],
        mutationsEnabled: true,
        syncEpoch: 0,
        reparsePending: true,
      }),
    );
    await waitFor(() => {
      expect(result.current.state).toBe("WAITING_PARSE");
    });
  });
});
