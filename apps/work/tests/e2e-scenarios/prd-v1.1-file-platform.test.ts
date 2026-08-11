// @vitest-environment node
/**
 * PRD §26 E2E-01..04 / E2E-07 core assertions (vitest, synthetic fixtures).
 * Association store is in-memory so tests do not require Electron's better-sqlite3 ABI.
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { basename, extname, join, resolve } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ManagedFile,
  ParsedDocument,
} from "../../src/shared/files";

const FIXTURES = resolve(__dirname, "../fixtures/files");

const mockState = vi.hoisted(() => ({
  hermesHome: "",
  files: new Map<string, ManagedFile>(),
  parsed: new Map<string, ParsedDocument>(),
  byHash: new Map<string, string>(),
}));

vi.mock("../../src/main/installer", () => ({
  get HERMES_HOME() {
    return mockState.hermesHome;
  },
}));

vi.mock("../../src/main/files/file-association-store", () => ({
  normalizeProfileId: (id?: string | null) =>
    id == null || id.trim() === "" ? "default" : id.trim(),
  findByHash: (_profile: string, hash: string) => {
    const id = mockState.byHash.get(hash);
    return id ? (mockState.files.get(id) ?? null) : null;
  },
  upsertManagedFile: (file: ManagedFile) => {
    mockState.files.set(file.id, file);
    if (file.contentHash) mockState.byHash.set(file.contentHash, file.id);
  },
  getManagedFile: (_profile: string, fileId: string) =>
    mockState.files.get(fileId) ?? null,
  getParsedDocument: (fileId: string) => mockState.parsed.get(fileId) ?? null,
  upsertParsedDocument: (doc: ParsedDocument) => {
    mockState.parsed.set(doc.fileId, doc);
  },
  insertAssociation: vi.fn(),
  insertChunks: vi.fn(),
  openFileIndexDb: vi.fn(() => ({
    prepare: () => ({
      all: () => [],
      get: () => undefined,
      run: () => undefined,
    }),
    transaction: (fn: () => void) => fn,
  })),
}));

vi.mock("../../src/main/files/file-config", () => ({
  readDesktopFilesConfig: () => ({
    managedStorage: false,
    copyPickerFiles: false,
    maxImportMb: 100,
    maxParseMb: 50,
    parsing: {
      enabled: true,
      concurrency: 2,
      officeParser: "office",
      pdfParser: "pdf",
      ocrEnabled: false,
      markitdownBin: "",
      markitdownTimeoutMs: 60_000,
    },
    indexing: {
      enabled: false,
      chunkChars: 4000,
      overlapChars: 200,
    },
    preview: {},
    allowedCategories: [],
  }),
  toFilesCapabilities: (c: unknown) => c,
}));

vi.mock("../../src/main/files/jobs/parse-file-job", () => ({
  enqueueParseFileJob: vi.fn(async () => "job-mock"),
  scheduleParseJob: vi.fn(),
}));

describe("PRD v1.1 file-platform E2E scenarios", () => {
  beforeEach(() => {
    mockState.hermesHome = mkdtempSync(join(tmpdir(), "hermes-e2e-files-"));
    mockState.files.clear();
    mockState.parsed.clear();
    mockState.byHash.clear();
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(mockState.hermesHome, { recursive: true, force: true });
  });

  function stageFixture(name: string): string {
    const dest = join(mockState.hermesHome, name);
    copyFileSync(join(FIXTURES, name), dest);
    return dest;
  }

  async function importFixture(name: string, sessionId: string) {
    const path = stageFixture(name);
    const { importOnePath } = await import(
      "../../src/main/files/file-import-service"
    );
    const result = await importOnePath(path, {
      profile: "default",
      sessionId,
      source: "picker",
    });
    return { path, result };
  }

  // @lat: [[rich-content#E2E scenarios#E2E-01 text import]]
  it(
    "E2E-01: fixture TXT import → parse → attachment + preview",
    async () => {
      const { result } = await importFixture("sample.txt", "s-e2e-01");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const fileId = result.file.id;

      const { parseFile } = await import(
        "../../src/main/files/file-parse-service"
      );
      const { toHermesAttachment } = await import(
        "../../src/main/files/attachment-adapter"
      );
      const { getPreviewDescriptor } = await import(
        "../../src/main/files/file-preview-service"
      );
      const { getManagedFile } = await import(
        "../../src/main/files/file-association-store"
      );

      const doc = await parseFile("default", fileId);
      expect(doc.text).toContain("Hermes file platform");

      const managed = getManagedFile("default", fileId);
      expect(managed).not.toBeNull();
      const att = toHermesAttachment(managed!, {
        mode: "local",
        parsed: doc,
      });
      expect(att.kind).toBe("text-file");
      expect(att.text).toContain("Hermes file platform");

      const preview = await getPreviewDescriptor("default", fileId);
      expect("error" in preview).toBe(false);
      if ("error" in preview) return;
      expect(preview.type).toBe("text");
    },
    15_000,
  );

  // @lat: [[rich-content#E2E scenarios#E2E-02 pdf path-ref]]
  it("E2E-02: PDF local path-ref; remote without path; parse enqueue-safe", async () => {
    const { result } = await importFixture("sample.pdf", "s-e2e-02");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fileId = result.file.id;

    const { parseFile } = await import(
      "../../src/main/files/file-parse-service"
    );
    const { toHermesAttachment } = await import(
      "../../src/main/files/attachment-adapter"
    );
    const { getManagedFile } = await import(
      "../../src/main/files/file-association-store"
    );
    const managed = getManagedFile("default", fileId)!;

    const local = toHermesAttachment(managed, { mode: "local" });
    expect(local.kind).toBe("path-ref");
    expect(local.path).toBeTruthy();

    expect(() => toHermesAttachment(managed, { mode: "remote" })).toThrow();

    await expect(parseFile("default", fileId)).resolves.toBeTruthy();
  });

  // @lat: [[rich-content#E2E scenarios#E2E-03 image dataUrl]]
  it("E2E-03: image toHermesAttachment includes dataUrl", async () => {
    const { result } = await importFixture("sample.png", "s-e2e-03");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { toHermesAttachment } = await import(
      "../../src/main/files/attachment-adapter"
    );
    const { getManagedFile } = await import(
      "../../src/main/files/file-association-store"
    );
    const managed = getManagedFile("default", result.file.id)!;
    expect(managed.category).toBe("image");

    const att = toHermesAttachment(managed, { mode: "local" });
    expect(att.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(att.dataUrl!.length).toBeGreaterThan(
      "data:image/png;base64,".length,
    );
  });

  // @lat: [[rich-content#E2E scenarios#E2E-04 corrupt docx]]
  it("E2E-04: corrupt.docx still path-ref; retry does not crash", async () => {
    const { result } = await importFixture("corrupt.docx", "s-e2e-04");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fileId = result.file.id;

    const { parseFile } = await import(
      "../../src/main/files/file-parse-service"
    );
    const { toHermesAttachment } = await import(
      "../../src/main/files/attachment-adapter"
    );
    const { getManagedFile } = await import(
      "../../src/main/files/file-association-store"
    );
    const { fileService } = await import("../../src/main/files/file-service");

    const managed = getManagedFile("default", fileId)!;
    const att = toHermesAttachment(managed, { mode: "local" });
    expect(att.kind).toBe("path-ref");
    expect(att.path).toBeTruthy();

    try {
      await parseFile("default", fileId);
    } catch {
      // failed parse is acceptable for corrupt fixture
    }

    const retry = await fileService.retryParse("default", fileId);
    expect(retry).toMatchObject({ fileId });
    expect(typeof retry.ok).toBe("boolean");
  });

  // @lat: [[rich-content#E2E scenarios#E2E-07 remote no path]]
  it("E2E-07: remote office/pdf attachments never leak path", async () => {
    const { resolveFileCategory, resolveMime } = await import(
      "../../src/main/files/file-category"
    );
    const { toHermesAttachment } = await import(
      "../../src/main/files/attachment-adapter"
    );

    for (const name of ["remote-safe.docx", "sample.pdf"] as const) {
      const diskPath = stageFixture(name);
      const size = statSync(diskPath).size;
      const mime = resolveMime(name);
      const file: ManagedFile = {
        id: `e2e07-${name}`,
        profileId: "default",
        name: basename(name),
        extension: extname(name).slice(1),
        mime,
        category: resolveFileCategory(name, mime),
        source: "picker",
        status: "ready",
        size,
        originalPath: diskPath,
        managedPath: diskPath,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const remote = toHermesAttachment(file, {
        mode: "remote",
        parsed: {
          fileId: file.id,
          parserId: "test",
          parserVersion: 1,
          text: "safe remote text",
          sections: [],
          metadata: {},
          truncated: false,
          parsedAt: new Date().toISOString(),
        },
      });
      expect(remote.path).toBeUndefined();
      expect(JSON.stringify(remote)).not.toContain(diskPath);
    }

    expect(readFileSync(join(FIXTURES, "README.md"), "utf8")).toMatch(
      /Synthetic/,
    );
  });
});
