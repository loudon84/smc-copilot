// @vitest-environment node
/**
 * TRACE: Path B download vs UNIQUE surface for incident source_file
 *   ce68050c-b99d-4041-af44-577da02a0a6d
 *
 * Production materialize now findByHash-dedups (see materialize-dedup tests).
 * These cases keep the download→error ordering contract.
 */
import { describe, expect, it, vi } from "vitest";
import {
  resolveDocumentPreview,
  type ResolveDocumentPreviewDeps,
} from "./knowledge-preview-resolve";

const INCIDENT_SOURCE_FILE_ID = "ce68050c-b99d-4041-af44-577da02a0a6d";

function baseDeps(
  overrides: Partial<ResolveDocumentPreviewDeps> = {},
): ResolveDocumentPreviewDeps {
  return {
    getCache: vi.fn(() => null),
    upsertCache: vi.fn(),
    unbindCache: vi.fn(),
    getFile: vi.fn(() => null),
    findJobs: vi.fn(() => []),
    getDataMode: () => "provider",
    downloadSourceFile: vi.fn(async () => ({
      bytes: new TextEncoder().encode("# README\n"),
      fileName: "README.md",
    })),
    materializeBytes: vi.fn(async () => ({
      managedFileId: "mf-new",
      associationId: "assoc-new",
    })),
    ...overrides,
  };
}

describe("TRACE Path B UNIQUE after download OK", () => {
  it("downloadSourceFile is invoked with sourceFileId only (no URL param)", async () => {
    const deps = baseDeps();
    await resolveDocumentPreview(
      {
        sourceFileId: INCIDENT_SOURCE_FILE_ID,
        activeVersionId: "v1",
        fileName: "README.md",
        mimeType: "text/markdown",
      },
      deps,
    );
    expect(deps.downloadSourceFile).toHaveBeenCalledWith({
      sourceFileId: INCIDENT_SOURCE_FILE_ID,
    });
    const arg = (deps.downloadSourceFile as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty("url");
  });

  it("when materialize throws UNIQUE, download already completed (error surface)", async () => {
    const downloadSourceFile = vi.fn(async () => ({
      bytes: new TextEncoder().encode("# README\n"),
      fileName: "README.md",
    }));
    const materializeBytes = vi.fn(async () => {
      throw new Error("UNIQUE");
    });
    const deps = baseDeps({ downloadSourceFile, materializeBytes });

    await expect(
      resolveDocumentPreview(
        {
          sourceFileId: INCIDENT_SOURCE_FILE_ID,
          activeVersionId: "v1",
          fileName: "README.md",
        },
        deps,
      ),
    ).rejects.toThrow(/UNIQUE/);

    expect(downloadSourceFile).toHaveBeenCalledTimes(1);
    expect(materializeBytes).toHaveBeenCalledTimes(1);
    expect(deps.upsertCache).not.toHaveBeenCalled();
  });
});
