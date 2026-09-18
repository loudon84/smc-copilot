// @vitest-environment node
/**
 * Knowledge Preview Cache store — Path A SOT.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDbConnection } from "../db";
import {
  ensureKnowledgePreviewCacheSchema,
  getPreviewCache,
  resetKnowledgePreviewCacheStoreForTests,
  unbindPreviewCache,
  upsertPreviewCache,
  versionsMatch,
} from "./knowledge-preview-cache-store";

vi.mock("../db", () => ({
  getDbConnection: vi.fn(),
}));

vi.mock("../files/file-association-store", () => ({
  deleteAssociation: vi.fn(),
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

class FakeStatement {
  constructor(
    private readonly sql: string,
    private readonly db: FakeDb,
  ) {}

  get(...args: unknown[]): unknown {
    if (this.sql.includes("sqlite_master")) {
      const name = String(args[0] ?? "");
      return this.db.tables.has(name) ? { name } : undefined;
    }
    if (this.sql.includes(`FROM ${TABLE}`) && this.sql.includes("LIMIT 1")) {
      const key = `${String(args[0])}::${String(args[1])}`;
      return this.db.rows.get(key);
    }
    return undefined;
  }

  all(): unknown[] {
    return [];
  }

  run(...args: unknown[]): { changes: number } {
    if (this.sql.includes("CREATE TABLE")) {
      this.db.tables.add(TABLE);
      return { changes: 0 };
    }
    if (this.sql.includes("INSERT INTO")) {
      const row: CacheRow = {
        work_profile_id: String(args[0]),
        source_file_id: String(args[1]),
        managed_file_id: String(args[2]),
        active_version_id: (args[3] as string | null) ?? null,
        materialize_association_id: (args[4] as string | null) ?? null,
        updated_at: String(args[5]),
      };
      this.db.rows.set(
        `${row.work_profile_id}::${row.source_file_id}`,
        row,
      );
      return { changes: 1 };
    }
    if (this.sql.includes("DELETE FROM")) {
      const key = `${String(args[0])}::${String(args[1])}`;
      const existed = this.db.rows.delete(key);
      return { changes: existed ? 1 : 0 };
    }
    return { changes: 0 };
  }
}

class FakeDb {
  tables = new Set<string>();
  rows = new Map<string, CacheRow>();

  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql, this);
  }

  exec(sql: string): void {
    if (sql.includes("CREATE TABLE")) {
      this.tables.add(TABLE);
    }
  }
}

describe("knowledge-preview-cache-store", () => {
  let fake: FakeDb;

  beforeEach(() => {
    fake = new FakeDb();
    resetKnowledgePreviewCacheStoreForTests();
    mockedGetDbConnection.mockImplementation(() => fake as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetKnowledgePreviewCacheStoreForTests();
  });

  it("upserts and reads cache by profile + source file", () => {
    ensureKnowledgePreviewCacheSchema();
    upsertPreviewCache({
      workProfileId: "default",
      sourceFileId: "sf-1",
      managedFileId: "mf-1",
      activeVersionId: "v1",
      materializeAssociationId: "assoc-1",
    });
    const row = getPreviewCache("default", "sf-1");
    expect(row).toMatchObject({
      managedFileId: "mf-1",
      activeVersionId: "v1",
      materializeAssociationId: "assoc-1",
    });
  });

  it("unbind deletes row and materialize association", async () => {
    const { deleteAssociation } = await import(
      "../files/file-association-store"
    );
    ensureKnowledgePreviewCacheSchema();
    upsertPreviewCache({
      workProfileId: "default",
      sourceFileId: "sf-1",
      managedFileId: "mf-1",
      activeVersionId: "v1",
      materializeAssociationId: "assoc-1",
    });
    unbindPreviewCache("default", "sf-1");
    expect(getPreviewCache("default", "sf-1")).toBeNull();
    expect(deleteAssociation).toHaveBeenCalledWith("default", "assoc-1");
  });

  it("versionsMatch treats dual null as equal", () => {
    expect(versionsMatch(null, null)).toBe(true);
    expect(versionsMatch("v1", "v1")).toBe(true);
    expect(versionsMatch("v1", "v2")).toBe(false);
    expect(versionsMatch(null, "v1")).toBe(false);
  });
});
