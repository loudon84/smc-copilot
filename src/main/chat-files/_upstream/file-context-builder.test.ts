// @vitest-environment node
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedFile, ParsedDocument } from "../../shared/files";

const mockState = vi.hoisted(() => ({
  hermesHome: "",
  config: {
    maxInlineTextChars: 100,
    indexing: { maxResults: 3 },
  },
  sessionRows: [] as Array<
    ManagedFile & {
      association: {
        id: string;
        fileId: string;
        profileId: string;
        sessionId: string;
        role: string;
        ordinal: number;
        createdAt: string;
      };
    }
  >,
  parsed: new Map<string, ParsedDocument>(),
  chunks: new Map<
    string,
    Array<{
      id: string;
      fileId: string;
      chunkIndex: number;
      content: string;
      metadata: Record<string, string | number | boolean>;
    }>
  >(),
  searchHits: [] as Array<{
    fileId: string;
    chunkIndex: number;
    content: string;
    score: number;
  }>,
}));

vi.mock("../installer", () => ({
  get HERMES_HOME() {
    return mockState.hermesHome;
  },
}));

vi.mock("./file-config", () => ({
  readDesktopFilesConfig: () => mockState.config,
}));

vi.mock("./file-association-store", () => ({
  normalizeProfileId: (id?: string | null) =>
    id == null || id.trim() === "" ? "default" : id.trim(),
  listBySession: () => mockState.sessionRows,
  getParsedDocument: (fileId: string) => mockState.parsed.get(fileId) ?? null,
  listChunksForFile: (fileId: string) => mockState.chunks.get(fileId) ?? [],
  searchChunks: () => mockState.searchHits,
}));

describe("file-context-builder", () => {
  beforeEach(() => {
    mockState.hermesHome = mkdtempSync(join(tmpdir(), "hermes-ctx-"));
    mockState.sessionRows = [];
    mockState.parsed.clear();
    mockState.chunks.clear();
    mockState.searchHits = [];
    mockState.config.maxInlineTextChars = 100;
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(mockState.hermesHome, { recursive: true, force: true });
  });

  function addContextFile(
    id: string,
    name: string,
    text: string,
  ): void {
    mockState.sessionRows.push({
      id,
      profileId: "default",
      name,
      extension: "txt",
      mime: "text/plain",
      category: "text",
      source: "picker",
      status: "parsed",
      size: text.length,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      association: {
        id: `a-${id}`,
        fileId: id,
        profileId: "default",
        sessionId: "sess-1",
        role: "context-file",
        ordinal: 0,
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    });
    mockState.parsed.set(id, {
      fileId: id,
      parserId: "text",
      parserVersion: 1,
      text,
      sections: [],
      metadata: {},
      truncated: false,
      parsedAt: "2024-01-01T00:00:00.000Z",
    });
  }

  // @lat: [[session-file-context#Context builder]]
  it("inlines small context files as full session_file XML", async () => {
    addContextFile("f1", "notes.txt", "hello world");
    const { buildSessionFileContext } = await import("./file-context-builder");
    const result = await buildSessionFileContext({
      sessionId: "sess-1",
      tokenBudget: 2000,
    });
    expect(result.text).toContain('<session_file id="f1"');
    expect(result.text).toContain("hello world");
    expect(result.sources).toEqual([
      { fileId: "f1", fileName: "notes.txt", chunkIndex: 0 },
    ]);
  });

  it("uses retrieved_file_context for large files with a query", async () => {
    const big = "x".repeat(400);
    addContextFile("f2", "big.txt", big);
    mockState.config.maxInlineTextChars = 50;
    mockState.searchHits = [
      {
        fileId: "f2",
        chunkIndex: 2,
        content: "matched chunk body",
        score: 1.2,
      },
    ];
    const { buildSessionFileContext } = await import("./file-context-builder");
    const result = await buildSessionFileContext({
      sessionId: "sess-1",
      query: "matched",
      tokenBudget: 4000,
    });
    expect(result.text).toContain("<retrieved_file_context");
    expect(result.text).toContain("matched chunk body");
    expect(result.sources[0]?.chunkIndex).toBe(2);
  });

  it("ignores non-context association roles", async () => {
    mockState.sessionRows.push({
      id: "f3",
      profileId: "default",
      name: "attach.txt",
      extension: "txt",
      mime: "text/plain",
      category: "text",
      source: "picker",
      status: "ready",
      size: 4,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      association: {
        id: "a-f3",
        fileId: "f3",
        profileId: "default",
        sessionId: "sess-1",
        role: "prompt-attachment",
        ordinal: 0,
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    });
    const { buildSessionFileContext } = await import("./file-context-builder");
    const result = await buildSessionFileContext({ sessionId: "sess-1" });
    expect(result.text).toBe("");
    expect(result.sources).toEqual([]);
  });
});
