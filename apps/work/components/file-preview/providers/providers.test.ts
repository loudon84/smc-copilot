import { describe, expect, it, vi } from "vitest";
import { createHttpFileProvider } from "./HttpFileProvider";
import { createKnowledgeFileProvider } from "./KnowledgeFileProvider";
import { createLocalFileProvider } from "./LocalFileProvider";

describe("FilePreview providers (AC-004 source isolation)", () => {
  it("LocalFileProvider resolves via getPreview id (not disk path)", async () => {
    const getPreview = vi.fn(async () => ({
      fileId: "mf-1",
      type: "markdown" as const,
      title: "a.md",
      mime: "text/markdown",
      content: "# hi",
      canOpenExternal: false,
      canSaveAs: false,
      canCopyText: true,
      canAddToContext: false,
      canRetryParse: false,
    }));
    const provider = createLocalFileProvider({ getPreview });
    const result = await provider.resolve({
      type: "local",
      id: "mf-1",
      name: "a.md",
      path: "C:\\\\secret\\\\a.md",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolved.fileName).toBe("a.md");
      expect(result.resolved.file).toBeInstanceOf(Blob);
      expect(result.resolved.file.size).toBeGreaterThan(0);
      expect(result.resolved.format).toBe("markdown");
    }
    expect(getPreview).toHaveBeenCalledWith("mf-1");
  });

  it("HttpFileProvider fetches url into File", async () => {
    const fetchImpl = vi.fn(async () => {
      return {
        ok: true,
        blob: async () => new Blob(["png"], { type: "image/png" }),
      } as Response;
    });
    const provider = createHttpFileProvider({ fetchImpl });
    const result = await provider.resolve({
      type: "url",
      id: "u1",
      name: "pic.png",
      url: "https://example.test/pic.png",
      mime: "image/png",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolved.format).toBe("image");
    }
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("KnowledgeFileProvider materializes then getPreview", async () => {
    const resolveDocumentPreview = vi.fn(async () => ({
      managedFileId: "mf-k",
    }));
    const getPreview = vi.fn(async () => ({
      fileId: "mf-k",
      type: "pdf" as const,
      title: "doc.pdf",
      mime: "application/pdf",
      localUrl: "hermes-file-preview://mf-k",
      canOpenExternal: false,
      canSaveAs: true,
      canCopyText: false,
      canAddToContext: false,
      canRetryParse: false,
    }));
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        blob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
      } as Response);

    const provider = createKnowledgeFileProvider({
      resolveDocumentPreview,
      getPreview,
    });
    const result = await provider.resolve({
      type: "knowledge",
      id: "sf-1",
      name: "doc.pdf",
      mime: "application/pdf",
      activeVersionId: "v1",
    });
    expect(result.ok).toBe(true);
    expect(resolveDocumentPreview).toHaveBeenCalledWith(
      expect.objectContaining({ sourceFileId: "sf-1", activeVersionId: "v1" }),
    );
    expect(getPreview).toHaveBeenCalledWith("mf-k");
    fetchSpy.mockRestore();
  });

  it("KnowledgeFileProvider emits download then prepare phases", async () => {
    const phases: string[] = [];
    const provider = createKnowledgeFileProvider({
      resolveDocumentPreview: async () => ({ managedFileId: "mf-1" }),
      getPreview: async () => ({
        title: "a.md",
        mime: "text/markdown",
        content: "# hi",
      }),
    });
    await provider.resolve(
      { type: "knowledge", id: "sf-1", name: "a.md" },
      { onPhase: (p) => phases.push(p) },
    );
    expect(phases).toEqual(["download", "prepare"]);
  });

  it("rejects cross-type resolve (provider isolation)", async () => {
    const local = createLocalFileProvider({
      getPreview: async () => {
        throw new Error("should not run");
      },
    });
    const mismatch = await local.resolve({
      type: "knowledge",
      id: "x",
      name: "x.md",
    });
    expect(mismatch.ok).toBe(false);
  });
});
