// @vitest-environment node
/**
 * AC-008 — Preview cache unbind makes materialize association deletable for orphan cleanup.
 */
import { describe, expect, it, vi } from "vitest";
import { getDbConnection } from "../db";
import {
  ensureKnowledgePreviewCacheSchema,
  getPreviewCache,
  resetKnowledgePreviewCacheStoreForTests,
  unbindPreviewCache,
  upsertPreviewCache,
} from "./knowledge-preview-cache-store";

vi.mock("../db", () => ({
  getDbConnection: vi.fn(),
}));

const deleteAssociation = vi.fn();
vi.mock("../files/file-association-store", () => ({
  deleteAssociation: (...args: unknown[]) => deleteAssociation(...args),
}));

const mockedGetDbConnection = vi.mocked(getDbConnection);
const TABLE = "knowledge_preview_cache";

type CacheRow = {
  work_profile_id: string;
  source_file_id: string;
  managed_file_id: string;
  active_version_id: string | null;
  materialize_association_id: string | null;
  updated_at: string;
};

class FakeDb {
  tables = new Set<string>();
  rows = new Map<string, CacheRow>();
  prepare(sql: string) {
    return {
      get: (...args: unknown[]) => {
        if (sql.includes("sqlite_master")) {
          return this.tables.has(String(args[0])) ? { name: args[0] } : undefined;
        }
        if (sql.includes(`FROM ${TABLE}`)) {
          return this.rows.get(`${String(args[0])}::${String(args[1])}`);
        }
        return undefined;
      },
      run: (...args: unknown[]) => {
        if (sql.includes("INSERT INTO")) {
          const row: CacheRow = {
            work_profile_id: String(args[0]),
            source_file_id: String(args[1]),
            managed_file_id: String(args[2]),
            active_version_id: (args[3] as string | null) ?? null,
            materialize_association_id: (args[4] as string | null) ?? null,
            updated_at: String(args[5]),
          };
          this.rows.set(`${row.work_profile_id}::${row.source_file_id}`, row);
        }
        if (sql.includes("DELETE FROM")) {
          this.rows.delete(`${String(args[0])}::${String(args[1])}`);
        }
        return { changes: 1 };
      },
      all: () => [],
    };
  }
  exec(sql: string) {
    if (sql.includes("CREATE TABLE")) this.tables.add(TABLE);
  }
}

describe("preview cache cleanup (AC-008)", () => {
  it("unbind removes cache and deletes materialize association only", () => {
    const fake = new FakeDb();
    mockedGetDbConnection.mockImplementation(() => fake as never);
    resetKnowledgePreviewCacheStoreForTests();
    deleteAssociation.mockClear();
    ensureKnowledgePreviewCacheSchema();
    upsertPreviewCache({
      workProfileId: "default",
      sourceFileId: "sf-1",
      managedFileId: "mf-1",
      activeVersionId: "v1",
      materializeAssociationId: "assoc-mat",
    });
    unbindPreviewCache("default", "sf-1");
    expect(getPreviewCache("default", "sf-1")).toBeNull();
    expect(deleteAssociation).toHaveBeenCalledWith("default", "assoc-mat");
  });

  it("unbind with null materialize assoc does not delete association", () => {
    const fake = new FakeDb();
    mockedGetDbConnection.mockImplementation(() => fake as never);
    resetKnowledgePreviewCacheStoreForTests();
    deleteAssociation.mockClear();
    ensureKnowledgePreviewCacheSchema();
    upsertPreviewCache({
      workProfileId: "default",
      sourceFileId: "sf-2",
      managedFileId: "mf-job",
      activeVersionId: "v1",
      materializeAssociationId: null,
    });
    unbindPreviewCache("default", "sf-2");
    expect(deleteAssociation).not.toHaveBeenCalled();
  });
});
