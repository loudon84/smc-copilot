// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedFile, ParsedDocument } from "../../../shared/files";

const mockState = vi.hoisted(() => ({
  files: new Map<string, ManagedFile>(),
  parsed: new Map<string, ParsedDocument>(),
}));

vi.mock("./file-association-store", () => ({
  normalizeProfileId: (id?: string | null) =>
    id == null || id.trim() === "" ? "default" : id.trim(),
  getManagedFile: (_profile: string, fileId: string) =>
    mockState.files.get(fileId) ?? null,
  getParsedDocument: (fileId: string) => mockState.parsed.get(fileId) ?? null,
}));

describe("file-preview-service", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hermes-files-preview-"));
    mockState.files.clear();
    mockState.parsed.clear();
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function baseFile(overrides: Partial<ManagedFile>): ManagedFile {
    return {
      id: overrides.id || "file-1",
      profileId: "default",
      name: "notes.txt",
      extension: "txt",
      mime: "text/plain",
      category: "text",
      source: "picker",
      status: "ready",
      size: 0,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  // @lat: [[file-platform#File preview]]
  it("returns FILE_NOT_FOUND when the managed file record is missing", async () => {
    const { getPreviewDescriptor } = await import("./file-preview-service");
    const result = await getPreviewDescriptor(undefined, "missing-id");
    expect("error" in result && result.error.code).toBe("FILE_NOT_FOUND");
  });

  it("returns FILE_NOT_FOUND when the file is gone from disk", async () => {
    const missingPath = join(dir, "gone.txt");
    mockState.files.set(
      "file-1",
      baseFile({ id: "file-1", originalPath: missingPath }),
    );
    const { getPreviewDescriptor } = await import("./file-preview-service");
    const result = await getPreviewDescriptor(undefined, "file-1");
    expect("error" in result && result.error.code).toBe("FILE_NOT_FOUND");
  });

  it("reads text content and reports truncation past the preview limit", async () => {
    const filePath = join(dir, "notes.txt");
    writeFileSync(filePath, "hello world");
    mockState.files.set(
      "file-1",
      baseFile({ id: "file-1", originalPath: filePath }),
    );
    const { getPreviewDescriptor } = await import("./file-preview-service");
    const result = await getPreviewDescriptor(undefined, "file-1");
    if ("error" in result) throw new Error("expected descriptor");
    expect(result.type).toBe("text");
    expect(result.content).toBe("hello world");
    expect(result.truncated).toBe(false);
    expect(result.canCopyText).toBe(true);
  });

  it("returns an image descriptor with a file:// localUrl", async () => {
    const filePath = join(dir, "photo.png");
    writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    mockState.files.set(
      "file-1",
      baseFile({
        id: "file-1",
        category: "image",
        mime: "image/png",
        originalPath: filePath,
      }),
    );
    const { getPreviewDescriptor } = await import("./file-preview-service");
    const result = await getPreviewDescriptor(undefined, "file-1");
    if ("error" in result) throw new Error("expected descriptor");
    expect(result.type).toBe("image");
    expect(result.localUrl).toMatch(/^file:\/\//);
  });

  it("marks office files unsupported with a Phase 4 reason when unparsed", async () => {
    const filePath = join(dir, "report.docx");
    writeFileSync(filePath, "binary-stub");
    mockState.files.set(
      "file-1",
      baseFile({
        id: "file-1",
        category: "office",
        name: "report.docx",
        extension: "docx",
        originalPath: filePath,
      }),
    );
    const { getPreviewDescriptor } = await import("./file-preview-service");
    const result = await getPreviewDescriptor(undefined, "file-1");
    if ("error" in result) throw new Error("expected descriptor");
    expect(result.type).toBe("unsupported");
    expect(result.unsupportedReason).toBe("Parse in Phase 4");
  });

  it("surfaces parsed office content when a ParsedDocument exists", async () => {
    const filePath = join(dir, "report.docx");
    writeFileSync(filePath, "binary-stub");
    mockState.files.set(
      "file-1",
      baseFile({
        id: "file-1",
        category: "office",
        name: "report.docx",
        extension: "docx",
        originalPath: filePath,
      }),
    );
    mockState.parsed.set("file-1", {
      fileId: "file-1",
      parserId: "markitdown",
      parserVersion: 1,
      text: "Parsed office text",
      sections: [],
      metadata: {},
      truncated: false,
      parsedAt: "2024-01-01T00:00:00.000Z",
    });
    const { getPreviewDescriptor } = await import("./file-preview-service");
    const result = await getPreviewDescriptor(undefined, "file-1");
    if ("error" in result) throw new Error("expected descriptor");
    expect(result.type).toBe("office");
    expect(result.content).toBe("Parsed office text");
  });
});
