// @vitest-environment node
/**
 * FIX: Path B materialize must reuse findByHash to avoid
 * idx_managed_files_profile_hash_local UNIQUE after F10 OK.
 */
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({ hermesHome: "" }));

vi.mock("../runtime/hermes-runtime-paths", () => ({
  get HERMES_HOME() {
    return mockState.hermesHome;
  },
  getHermesHome: () => mockState.hermesHome,
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => mockState.hermesHome,
    setPath: () => undefined,
  },
}));

describe("materializeKnowledgePreviewBytes hash dedup", () => {
  beforeEach(() => {
    mockState.hermesHome = mkdtempSync(
      join(tmpdir(), "hermes-kb-preview-mat-"),
    );
    vi.resetModules();
  });

  afterEach(async () => {
    const store = await import("../files/file-association-store");
    store.closeFileIndexDb();
    rmSync(mockState.hermesHome, { recursive: true, force: true });
  });

  it("second materialize of identical bytes reuses ManagedFile (no UNIQUE)", async () => {
    const { materializeKnowledgePreviewBytes } = await import(
      "./knowledge-preview-resolve"
    );
    const bytes = new TextEncoder().encode("# README incident\n");

    const first = await materializeKnowledgePreviewBytes({
      workProfileId: "default",
      sourceFileId: "ce68050c-b99d-4041-af44-577da02a0a6d",
      activeVersionId: "v1",
      bytes,
      fileName: "README.md",
      mimeType: "text/markdown",
    });

    const second = await materializeKnowledgePreviewBytes({
      workProfileId: "default",
      sourceFileId: "ce68050c-b99d-4041-af44-577da02a0a6d",
      activeVersionId: "v1",
      bytes,
      fileName: "README.md",
      mimeType: "text/markdown",
    });

    expect(second.managedFileId).toBe(first.managedFileId);
    expect(second.associationId).not.toBe(first.associationId);
  });

  it("reuses ManagedFile created by a prior local insert with same hash", async () => {
    const store = await import("../files/file-association-store");
    const { createHash } = await import("crypto");
    const { writeFileSync, mkdirSync } = await import("fs");
    const bytes = new TextEncoder().encode("# prior upload\n");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const managedDir = join(mockState.hermesHome, "files", "managed");
    mkdirSync(managedDir, { recursive: true });
    const managedPath = join(managedDir, `${hash}.bin`);
    writeFileSync(managedPath, Buffer.from(bytes));

    const priorId = "prior-upload-mf";
    const ts = "2026-09-18T00:00:00.000Z";
    store.upsertManagedFile({
      id: priorId,
      profileId: "default",
      name: "README.md",
      extension: "md",
      mime: "text/markdown",
      category: "markdown",
      source: "picker",
      status: "stored",
      size: bytes.byteLength,
      managedPath,
      contentHash: hash,
      createdAt: ts,
      updatedAt: ts,
      locality: "local",
    });

    const { materializeKnowledgePreviewBytes } = await import(
      "./knowledge-preview-resolve"
    );
    const result = await materializeKnowledgePreviewBytes({
      workProfileId: "default",
      sourceFileId: "ce68050c-b99d-4041-af44-577da02a0a6d",
      activeVersionId: "v1",
      bytes,
      fileName: "README.md",
    });

    expect(result.managedFileId).toBe(priorId);
  });
});
