/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  FILE_CONTENT_UNREADABLE_MESSAGE,
  type FileImportResult,
  type ManagedFileView,
} from "../../../../shared/files";
import {
  resolveComposerDisplayError,
  resolveManagedResults,
} from "./composerFilePlatform";

function view(partial: Partial<ManagedFileView> & { id: string; name: string }): ManagedFileView {
  return {
    id: partial.id,
    name: partial.name,
    extension: partial.extension ?? "pdf",
    mime: partial.mime ?? "application/pdf",
    category: partial.category ?? "pdf",
    source: partial.source ?? "picker",
    status: partial.status ?? "ready",
    size: partial.size ?? 10,
    contentHash: partial.contentHash ?? "hash",
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-01-01T00:00:00.000Z",
    hasManagedCopy: partial.hasManagedCopy ?? false,
  };
}

describe("composerFilePlatform content gate", () => {
  beforeEach(() => {
    vi.stubGlobal("hermesAPI", {
      files: {
        toAttachments: vi.fn(async ({ fileIds }: { fileIds: string[] }) =>
          fileIds.map((id) => ({
            id,
            kind: "file" as const,
            name: `${id}.pdf`,
            mime: "application/pdf",
            size: 10,
          })),
        ),
      },
    });
  });

  it("maps FILE_CONTENT_ENCRYPTED_OR_INVALID to read-failed and keeps message (A-PFC-009/012)", async () => {
    const results: FileImportResult[] = [
      {
        ok: false,
        error: {
          code: "FILE_CONTENT_ENCRYPTED_OR_INVALID",
          message: FILE_CONTENT_UNREADABLE_MESSAGE,
          retryable: false,
          detail: "pdf:unknown",
        },
      },
    ];
    const out = await resolveManagedResults(
      results,
      { sessionId: "s1" },
      0,
    );
    expect(out.attachments).toHaveLength(0);
    expect(out.errors).toEqual([{ code: "read-failed", filename: "file" }]);
    expect(out.platformErrors).toEqual([FILE_CONTENT_UNREADABLE_MESSAGE]);
    expect(out.platformErrors[0]).not.toMatch(/confirmed Eisoo|已确认亿赛通/i);

    const display = resolveComposerDisplayError(
      out.errors,
      out.platformErrors,
      (name) => `${name}: content does not match its type, or may be protected. Try a readable copy.`,
    );
    expect(display).toContain("protected");
    expect(display).not.toMatch(/confirmed Eisoo/i);
  });

  it("isolates multi-select valid/invalid siblings (A-PFC-007)", async () => {
    const results: FileImportResult[] = [
      {
        ok: true,
        file: view({ id: "a", name: "valid.pdf" }),
      },
      {
        ok: false,
        error: {
          code: "FILE_CONTENT_ENCRYPTED_OR_INVALID",
          message: FILE_CONTENT_UNREADABLE_MESSAGE,
          retryable: false,
        },
      },
      {
        ok: true,
        file: view({ id: "c", name: "valid.png", extension: "png", mime: "image/png" }),
      },
    ];
    const out = await resolveManagedResults(
      results,
      { sessionId: "s1" },
      0,
    );
    expect(out.attachments).toHaveLength(2);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].code).toBe("read-failed");
    expect(out.platformErrors).toHaveLength(1);
  });
});
