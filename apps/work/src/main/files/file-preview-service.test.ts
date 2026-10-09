// @vitest-environment node
import {
  createReadStream,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedFile, ParsedDocument } from "../../shared/files";

const mockState = vi.hoisted(() => ({
  files: new Map<string, ManagedFile>(),
  parsed: new Map<string, ParsedDocument>(),
  parseFile: vi.fn<typeof import("./file-parse-service").parseFile>(),
  profileLimits: new Map<string, number>(),
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    createReadStream: vi.fn(actual.createReadStream),
  };
});

vi.mock("./file-association-store", () => ({
  normalizeProfileId: (id?: string | null) =>
    id == null || id.trim() === "" ? "default" : id.trim(),
  getManagedFile: (profile: string, fileId: string) => {
    const file = mockState.files.get(fileId);
    return file?.profileId === profile ? file : null;
  },
  getParsedDocument: (fileId: string) => mockState.parsed.get(fileId) ?? null,
}));

vi.mock("./file-parse-service", () => ({
  parseFile: mockState.parseFile,
}));

vi.mock("./file-config", () => ({
  readDesktopFilesConfig: vi.fn((profile?: string) => ({
    maxParseMb: mockState.profileLimits.get(profile ?? "default") ?? 8,
  })),
}));

describe("file-preview-service", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hermes-files-preview-"));
    mockState.files.clear();
    mockState.parsed.clear();
    mockState.profileLimits.clear();
    mockState.parseFile.mockReset();
    mockState.parseFile.mockRejectedValue(new Error("Parse failed"));
    vi.clearAllMocks();
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

  function officeFile(overrides: Partial<ManagedFile> = {}): string {
    const path = join(dir, "report.docx");
    writeFileSync(path, "binary-stub");
    const file = baseFile({
      id: "file-1",
      category: "office",
      name: "report.docx",
      extension: "docx",
      originalPath: path,
      ...overrides,
    });
    mockState.files.set(file.id, file);
    return path;
  }

  function parsedOffice(text = "Parsed office text"): ParsedDocument {
    return {
      fileId: "file-1",
      parserId: "office",
      parserVersion: 1,
      text,
      sections: [],
      metadata: {},
      truncated: false,
      parsedAt: "2024-01-01T00:00:00.000Z",
    };
  }

  // @lat: [[file-platform#File preview]]
  it("returns FILE_NOT_FOUND when the managed file record is missing", async () => {
    const { getPreviewDescriptor } = await import("./file-preview-service");
    const result = await getPreviewDescriptor(undefined, "missing-id");
    expect("error" in result && result.error.code).toBe("FILE_NOT_FOUND");
    expect(mockState.parseFile).not.toHaveBeenCalled();
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
    expect(mockState.parseFile).not.toHaveBeenCalled();
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
    expect(mockState.parseFile).not.toHaveBeenCalled();
  });

  it("returns an image descriptor with a hermes-file-preview localUrl", async () => {
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
    const { getPreviewDescriptor, FILE_PREVIEW_SCHEME } =
      await import("./file-preview-service");
    const result = await getPreviewDescriptor(undefined, "file-1");
    if ("error" in result) throw new Error("expected descriptor");
    expect(result.type).toBe("image");
    expect(result.localUrl).toMatch(new RegExp(`^${FILE_PREVIEW_SCHEME}://`));
    expect(mockState.parseFile).not.toHaveBeenCalled();
  });

  it("keeps the unsupported Office fallback when on-demand parsing fails", async () => {
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
    expect(mockState.parseFile).toHaveBeenCalledExactlyOnceWith(
      undefined,
      "file-1",
    );
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
    expect(mockState.parseFile).not.toHaveBeenCalled();
  });

  it("parses uncached Office previews with the original profile and normal options", async () => {
    officeFile({ profileId: "office-profile" });
    mockState.parseFile.mockResolvedValue(parsedOffice());
    const { getPreviewDescriptor } = await import("./file-preview-service");
    const result = await getPreviewDescriptor("office-profile", "file-1");
    expect(result).toMatchObject({
      type: "office",
      content: "Parsed office text",
      truncated: false,
      canCopyText: true,
    });
    expect(mockState.parseFile).toHaveBeenCalledExactlyOnceWith(
      "office-profile",
      "file-1",
    );
  });

  it("keeps cached empty Office content unsupported without reparsing", async () => {
    officeFile();
    mockState.parsed.set("file-1", parsedOffice(""));
    const { getPreviewDescriptor } = await import("./file-preview-service");
    const result = await getPreviewDescriptor(undefined, "file-1");
    expect(result).toMatchObject({
      type: "unsupported",
      unsupportedReason: "Parse in Phase 4",
    });
    expect(mockState.parseFile).not.toHaveBeenCalled();
  });

  it("keeps empty on-demand Office results unsupported", async () => {
    officeFile();
    mockState.parseFile.mockResolvedValue(parsedOffice(""));
    const { getPreviewDescriptor } = await import("./file-preview-service");
    const result = await getPreviewDescriptor(undefined, "file-1");
    expect(result).toMatchObject({
      type: "unsupported",
      unsupportedReason: "Parse in Phase 4",
    });
    expect(mockState.parseFile).toHaveBeenCalledExactlyOnceWith(
      undefined,
      "file-1",
    );
  });

  it("rejects an Office file from another profile before parsing or returning its cache", async () => {
    officeFile({ profileId: "office-profile" });
    mockState.parsed.set("file-1", parsedOffice());
    const { getPreviewDescriptor } = await import("./file-preview-service");
    const result = await getPreviewDescriptor("other-profile", "file-1");
    expect("error" in result && result.error.code).toBe("FILE_NOT_FOUND");
    expect(mockState.parseFile).not.toHaveBeenCalled();
  });

  it("checks actual Office size against the requested profile limit without content reads", async () => {
    const filePath = officeFile({ profileId: "limited-profile", size: 1 });
    writeFileSync(filePath, Buffer.alloc(1024 * 1024 + 1));
    mockState.profileLimits.set("limited-profile", 1);
    mockState.parseFile.mockResolvedValue(parsedOffice());
    const { getPreviewDescriptor } = await import("./file-preview-service");
    const { readDesktopFilesConfig } = await import("./file-config");
    vi.mocked(readFileSync).mockClear();
    vi.mocked(createReadStream).mockClear();
    const result = await getPreviewDescriptor("limited-profile", "file-1");
    expect(result).toMatchObject({
      type: "unsupported",
      unsupportedReason: "Parse in Phase 4",
    });
    expect(readDesktopFilesConfig).toHaveBeenCalledWith("limited-profile");
    expect(mockState.parseFile).not.toHaveBeenCalled();
    expect(readFileSync).not.toHaveBeenCalled();
    expect(createReadStream).not.toHaveBeenCalled();
  });

  it("keeps remote Office previews on the existing remote path without local parsing", async () => {
    mockState.files.set(
      "file-1",
      baseFile({
        category: "office",
        locality: "remote",
        provider: "expert",
        remoteArtifactId: "remote-office-1",
      }),
    );
    const { getPreviewDescriptor } = await import("./file-preview-service");
    const result = await getPreviewDescriptor(undefined, "file-1");
    expect(result).toMatchObject({
      type: "unsupported",
      unsupportedReason:
        "Preview is not available for this remote artifact type",
    });
    expect(mockState.parseFile).not.toHaveBeenCalled();
  });
});
