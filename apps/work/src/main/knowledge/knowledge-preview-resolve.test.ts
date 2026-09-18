// @vitest-environment node
/**
 * Knowledge document preview resolve — Path A / A-Job / Path B.
 */
import { describe, expect, it, vi } from "vitest";
import { KNOWLEDGE_ERROR_CODES } from "../../shared/knowledge/knowledge-base-ipc";
import { KnowledgeFacadeError } from "../../shared/knowledge/knowledge-errors";
import {
  resolveDocumentPreview,
  type ResolveDocumentPreviewDeps,
} from "./knowledge-preview-resolve";

function baseDeps(
  overrides: Partial<ResolveDocumentPreviewDeps> = {},
): ResolveDocumentPreviewDeps {
  return {
    getCache: vi.fn(() => null),
    upsertCache: vi.fn(),
    unbindCache: vi.fn(),
    getFile: vi.fn(() => ({
      id: "mf-1",
      profileId: "default",
      name: "a.md",
      extension: "md",
      mime: "text/markdown",
      category: "markdown" as const,
      source: "workspace" as const,
      status: "stored" as const,
      size: 1,
      managedPath: "/tmp/a.md",
      createdAt: "",
      updatedAt: "",
    })),
    findJobs: vi.fn(() => []),
    getDataMode: () => "provider",
    downloadSourceFile: vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "a.md",
    })),
    materializeBytes: vi.fn(async () => ({
      managedFileId: "mf-new",
      associationId: "assoc-new",
    })),
    ...overrides,
  };
}

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: vi.fn(() => true),
  };
});

describe("resolveDocumentPreview", () => {
  it("AC-001: returns cache hit without download", async () => {
    const deps = baseDeps({
      getCache: vi.fn(() => ({
        workProfileId: "default",
        sourceFileId: "sf-1",
        managedFileId: "mf-cached",
        activeVersionId: "v1",
        materializeAssociationId: null,
        updatedAt: "",
      })),
    });
    const result = await resolveDocumentPreview(
      { sourceFileId: "sf-1", activeVersionId: "v1" },
      deps,
    );
    expect(result.managedFileId).toBe("mf-cached");
    expect(deps.downloadSourceFile).not.toHaveBeenCalled();
    expect(deps.findJobs).not.toHaveBeenCalled();
  });

  it("AC-007: prefers newest completed provider job and skips mock", async () => {
    const deps = baseDeps({
      findJobs: vi.fn(() => [
        {
          jobId: "mock:old",
          managedFileId: "mf-mock",
          dataMode: "mock" as const,
          updatedAt: "2026-09-17T12:00:00.000Z",
        },
        {
          jobId: "job-real",
          managedFileId: "mf-job",
          dataMode: "provider" as const,
          updatedAt: "2026-09-17T11:00:00.000Z",
        },
      ]),
    });
    const result = await resolveDocumentPreview(
      { sourceFileId: "sf-1", activeVersionId: "v1" },
      deps,
    );
    expect(result.managedFileId).toBe("mf-job");
    expect(deps.upsertCache).toHaveBeenCalledWith(
      expect.objectContaining({
        managedFileId: "mf-job",
        materializeAssociationId: null,
      }),
    );
    expect(deps.downloadSourceFile).not.toHaveBeenCalled();
  });

  it("AC-002: Path B materializes when cache and job miss", async () => {
    const deps = baseDeps();
    const result = await resolveDocumentPreview(
      { sourceFileId: "sf-1", activeVersionId: "v2", fileName: "doc.pdf" },
      deps,
    );
    expect(deps.downloadSourceFile).toHaveBeenCalledWith({
      sourceFileId: "sf-1",
    });
    expect(deps.materializeBytes).toHaveBeenCalled();
    expect(result.managedFileId).toBe("mf-new");
    expect(deps.upsertCache).toHaveBeenCalledWith(
      expect.objectContaining({
        managedFileId: "mf-new",
        activeVersionId: "v2",
        materializeAssociationId: "assoc-new",
      }),
    );
  });

  it("AC-006: version mismatch unbinds old cache then rematerializes", async () => {
    const deps = baseDeps({
      getCache: vi.fn(() => ({
        workProfileId: "default",
        sourceFileId: "sf-1",
        managedFileId: "mf-v1",
        activeVersionId: "v1",
        materializeAssociationId: "assoc-v1",
        updatedAt: "",
      })),
    });
    const result = await resolveDocumentPreview(
      { sourceFileId: "sf-1", activeVersionId: "v2" },
      deps,
    );
    expect(deps.unbindCache).toHaveBeenCalledWith("default", "sf-1");
    expect(result.managedFileId).toBe("mf-new");
  });

  it("forceRefresh unbinds and downloads", async () => {
    const deps = baseDeps({
      getCache: vi.fn(() => ({
        workProfileId: "default",
        sourceFileId: "sf-1",
        managedFileId: "mf-cached",
        activeVersionId: "v1",
        materializeAssociationId: null,
        updatedAt: "",
      })),
    });
    await resolveDocumentPreview(
      { sourceFileId: "sf-1", activeVersionId: "v1", forceRefresh: true },
      deps,
    );
    expect(deps.unbindCache).toHaveBeenCalled();
    expect(deps.downloadSourceFile).toHaveBeenCalled();
  });

  it("AC-004: surfaces download errors", async () => {
    const deps = baseDeps({
      downloadSourceFile: vi.fn(async () => {
        throw new KnowledgeFacadeError({
          code: KNOWLEDGE_ERROR_CODES.NOT_FOUND,
          httpStatus: 404,
        });
      }),
    });
    await expect(
      resolveDocumentPreview({ sourceFileId: "sf-missing" }, deps),
    ).rejects.toMatchObject({ code: KNOWLEDGE_ERROR_CODES.NOT_FOUND });
  });
});
