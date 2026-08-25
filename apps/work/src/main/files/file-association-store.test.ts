// @vitest-environment node
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedFile } from "../../shared/files";

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

function baseRemote(
  overrides: Partial<ManagedFile> & { id: string; remoteArtifactId: string },
): ManagedFile {
  const ts = "2026-01-01T00:00:00.000Z";
  return {
    profileId: "default",
    name: "report.md",
    extension: "md",
    mime: "text/markdown",
    category: "markdown",
    source: "agent-output",
    status: "ready",
    size: 100,
    createdAt: ts,
    updatedAt: ts,
    locality: "remote",
    provider: "expert",
    remoteTaskId: "task-1",
    availability: "available",
    providerPreviewSupported: true,
    canPreview: true,
    ...overrides,
  };
}

describe("file-association-store remote identity", () => {
  beforeEach(() => {
    mockState.hermesHome = mkdtempSync(
      join(tmpdir(), "hermes-files-assoc-"),
    );
    vi.resetModules();
  });

  afterEach(async () => {
    const store = await import("./file-association-store");
    store.closeFileIndexDb();
    rmSync(mockState.hermesHome, { recursive: true, force: true });
  });

  it("upserts a remote resource without managedPath and reloads metadata", async () => {
    const store = await import("./file-association-store");
    const file = baseRemote({ id: "f1", remoteArtifactId: "art-1" });
    store.upsertManagedFile(file);
    const loaded = store.getManagedFile("default", "f1");
    expect(loaded).toMatchObject({
      id: "f1",
      locality: "remote",
      provider: "expert",
      remoteArtifactId: "art-1",
      availability: "available",
      canPreview: true,
    });
    expect(loaded?.managedPath).toBeUndefined();
  });

  it("does not collapse distinct remote artifacts with the same content hash", async () => {
    const store = await import("./file-association-store");
    const hash = "a".repeat(64);
    store.upsertManagedFile(
      baseRemote({ id: "f1", remoteArtifactId: "art-1", contentHash: hash }),
    );
    store.upsertManagedFile(
      baseRemote({
        id: "f2",
        remoteArtifactId: "art-2",
        contentHash: hash,
        name: "other.md",
      }),
    );
    expect(store.getManagedFile("default", "f1")?.remoteArtifactId).toBe(
      "art-1",
    );
    expect(store.getManagedFile("default", "f2")?.remoteArtifactId).toBe(
      "art-2",
    );
    expect(
      store.findByRemoteIdentity({
        profileId: "default",
        provider: "expert",
        remoteArtifactId: "art-1",
      })?.id,
    ).toBe("f1");
    expect(store.findByHash("default", hash)).toBeNull();
  });

  it("is idempotent for (session, file, role) associations", async () => {
    const store = await import("./file-association-store");
    store.upsertManagedFile(
      baseRemote({ id: "f1", remoteArtifactId: "art-1" }),
    );
    const ts = "2026-01-01T00:00:00.000Z";
    store.insertAssociation({
      id: "a1",
      fileId: "f1",
      profileId: "default",
      sessionId: "sess-1",
      role: "agent-output",
      ordinal: 0,
      createdAt: ts,
    });
    store.insertAssociation({
      id: "a2",
      fileId: "f1",
      profileId: "default",
      sessionId: "sess-1",
      role: "agent-output",
      ordinal: 1,
      createdAt: ts,
    });
    const rows = store.listBySession("default", "sess-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.association.id).toBe("a1");
  });

  it("findByRemoteIdentity returns the same row on rediscovery upsert by identity", async () => {
    const store = await import("./file-association-store");
    store.upsertManagedFile(
      baseRemote({ id: "f1", remoteArtifactId: "art-1", size: 10 }),
    );
    const existing = store.findByRemoteIdentity({
      profileId: "default",
      provider: "expert",
      remoteArtifactId: "art-1",
    });
    expect(existing?.id).toBe("f1");
    store.upsertManagedFile(
      baseRemote({
        id: existing!.id,
        remoteArtifactId: "art-1",
        size: 99,
        name: "updated.md",
      }),
    );
    expect(store.getManagedFile("default", "f1")?.size).toBe(99);
    expect(store.getManagedFile("default", "f1")?.name).toBe("updated.md");
  });
});
