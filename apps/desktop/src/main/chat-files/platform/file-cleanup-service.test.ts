// @vitest-environment node
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedFile } from "../../../shared/files";

const mockState = vi.hoisted(() => ({
  hermesHome: "",
  orphanRetentionDays: 30,
  tempRetentionHours: 24,
  orphans: [] as ManagedFile[],
  deletedIds: [] as string[],
}));

vi.mock("../../installer", () => ({
  get HERMES_HOME() {
    return mockState.hermesHome;
  },
}));

vi.mock("./file-config", () => ({
  readDesktopFilesConfig: () => ({
    cleanup: {
      orphanRetentionDays: mockState.orphanRetentionDays,
      tempRetentionHours: mockState.tempRetentionHours,
    },
  }),
}));

vi.mock("./file-association-store", () => ({
  normalizeProfileId: (id?: string | null) =>
    id == null || id.trim() === "" ? "default" : id.trim(),
  listOrphanManagedFiles: () => mockState.orphans,
  deleteManagedFileRecord: (_profile: string, fileId: string) => {
    mockState.deletedIds.push(fileId);
  },
  countAssociations: (fileId: string) =>
    fileId === "kept-1" ? 1 : 0,
}));

describe("file-cleanup-service", () => {
  beforeEach(() => {
    mockState.hermesHome = mkdtempSync(join(tmpdir(), "hermes-cleanup-"));
    mockState.orphanRetentionDays = 30;
    mockState.tempRetentionHours = 24;
    mockState.orphans = [];
    mockState.deletedIds = [];
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(mockState.hermesHome, { recursive: true, force: true });
  });

  // @lat: [[file-platform#Cleanup]]
  it("removes stale temp files past retention hours", async () => {
    const { ensureFilesLayout } = await import("./file-store");
    const { cleanupTempFiles } = await import("./file-cleanup-service");
    const layout = ensureFilesLayout();
    const stale = join(layout.temp, "old.bin");
    const fresh = join(layout.temp, "new.bin");
    writeFileSync(stale, "old");
    writeFileSync(fresh, "new");
    const oldMs = Date.now() - 48 * 60 * 60 * 1000;
    utimesSync(stale, oldMs / 1000, oldMs / 1000);

    const result = cleanupTempFiles();
    expect(result.deletedFiles).toBe(1);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
  });

  it("deletes orphan managed copies older than retention days", async () => {
    const { ensureFilesLayout } = await import("./file-store");
    const { cleanupOrphanFiles } = await import("./file-cleanup-service");

    const layout = ensureFilesLayout();
    const objectsDir = join(layout.objects, "ab");
    mkdirSync(objectsDir, { recursive: true });
    const managedPath = join(objectsDir, "deadbeef".padEnd(64, "0"));
    writeFileSync(managedPath, "orphan-bytes");

    const oldIso = new Date(
      Date.now() - 40 * 24 * 60 * 60 * 1000,
    ).toISOString();
    mockState.orphans = [
      {
        id: "orphan-1",
        profileId: "default",
        name: "gone.txt",
        extension: "txt",
        mime: "text/plain",
        category: "text",
        source: "picker",
        status: "stored",
        size: 12,
        managedPath,
        contentHash: "deadbeef".padEnd(64, "0"),
        createdAt: oldIso,
        updatedAt: oldIso,
      },
    ];

    const result = cleanupOrphanFiles();
    expect(result.deletedFiles).toBe(1);
    expect(existsSync(managedPath)).toBe(false);
    expect(mockState.deletedIds).toEqual(["orphan-1"]);
  });
});
