// @vitest-environment node
/**
 * V02 / TA-WK11-FACADE — Provider Facade + Mock Adapter (AC-02 / AC-03 / AC-11 / AC-13).
 * Must not import React, renderer, or apps/knowledge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { getDbConnection } from "../db";
import type {
  KnowledgeActiveDataMode,
  KnowledgeFacadeEntityKind,
  KnowledgeJobPartition,
  KnowledgeModeSnapshot,
} from "../../shared/knowledge/knowledge-job-ipc";
import {
  KnowledgeFacadeUnavailableError,
  KnowledgeFacadePartitionDeniedError,
  KnowledgeProviderFacade,
  resetKnowledgeProviderFacadeForTests,
} from "./knowledge-provider-facade";
import { resetKnowledgeMockStoreForTests } from "./knowledge-mock-store";

vi.mock("../db", () => ({
  getDbConnection: vi.fn(),
}));

const mockedGetDbConnection = vi.mocked(getDbConnection);

const TABLE = "knowledge_mock_entities";

type EntityRow = {
  work_profile_id: string;
  auth_subject: string;
  tenant_scope_kind: string;
  tenant_id: string | null;
  data_mode: string;
  kind: string;
  entity_id: string;
  title: string | null;
  permission_json: string | null;
  payload_json: string;
  updated_at: string;
};

class FakeStatement {
  constructor(
    private readonly sql: string,
    private readonly db: FakeDb,
  ) {}

  private matchesPartition(
    row: EntityRow,
    workProfileId: unknown,
    authSubject: unknown,
    tenantScopeKind: unknown,
    tenantId: unknown,
    dataMode: unknown,
  ): boolean {
    if (row.work_profile_id !== String(workProfileId)) return false;
    if (row.auth_subject !== String(authSubject)) return false;
    if (row.tenant_scope_kind !== String(tenantScopeKind)) return false;
    if (tenantId == null) {
      if (row.tenant_id != null) return false;
    } else if (row.tenant_id !== String(tenantId)) {
      return false;
    }
    return row.data_mode === String(dataMode);
  }

  get(...args: unknown[]): unknown {
    if (this.sql.includes("sqlite_master")) {
      const name = String(args[0] ?? "");
      return this.db.tables.has(name) ? { name } : undefined;
    }
    if (this.sql.includes(`FROM ${TABLE}`) && this.sql.includes("entity_id")) {
      // Args: profile, subject, scopeKind, tenantId(null-check), tenantId(eq), dataMode, kind, entityId
      const [
        workProfileId,
        authSubject,
        tenantScopeKind,
        tenantId,
        ,
        dataMode,
        kind,
        entityId,
      ] = args;
      for (const row of this.db.rows.values()) {
        if (
          this.matchesPartition(
            row,
            workProfileId,
            authSubject,
            tenantScopeKind,
            tenantId,
            dataMode,
          ) &&
          row.kind === String(kind) &&
          row.entity_id === String(entityId)
        ) {
          return row;
        }
      }
      return undefined;
    }
    return undefined;
  }

  all(...args: unknown[]): unknown[] {
    if (this.sql.includes("PRAGMA table_info")) {
      const cols = this.db.columns.get(TABLE) ?? new Set<string>();
      return [...cols].map((name, cid) => ({ cid, name }));
    }
    if (this.sql.includes(`FROM ${TABLE}`) && this.sql.includes("kind =")) {
      // Args: profile, subject, scopeKind, tenantId(null-check), tenantId(eq), dataMode, kind
      const [
        workProfileId,
        authSubject,
        tenantScopeKind,
        tenantId,
        ,
        dataMode,
        kind,
      ] = args;
      return [...this.db.rows.values()].filter(
        (row) =>
          this.matchesPartition(
            row,
            workProfileId,
            authSubject,
            tenantScopeKind,
            tenantId,
            dataMode,
          ) && row.kind === String(kind),
      );
    }
    return [];
  }

  run(...args: unknown[]): void {
    if (
      this.sql.includes(`INSERT INTO ${TABLE}`) ||
      this.sql.includes("INSERT OR REPLACE")
    ) {
      const [
        work_profile_id,
        auth_subject,
        tenant_scope_kind,
        tenant_id,
        data_mode,
        kind,
        entity_id,
        title,
        permission_json,
        payload_json,
        updated_at,
      ] = args;
      const key = [
        work_profile_id,
        auth_subject,
        tenant_scope_kind,
        tenant_id ?? "",
        data_mode,
        kind,
        entity_id,
      ].join("|");
      this.db.rows.set(key, {
        work_profile_id: String(work_profile_id),
        auth_subject: String(auth_subject),
        tenant_scope_kind: String(tenant_scope_kind),
        tenant_id: tenant_id == null ? null : String(tenant_id),
        data_mode: String(data_mode),
        kind: String(kind),
        entity_id: String(entity_id),
        title: title == null ? null : String(title),
        permission_json:
          permission_json == null ? null : String(permission_json),
        payload_json: String(payload_json),
        updated_at: String(updated_at),
      });
      return;
    }
    if (this.sql.includes(`DELETE FROM ${TABLE}`)) {
      const [
        workProfileId,
        authSubject,
        tenantScopeKind,
        tenantId,
        ,
        dataMode,
        kind,
        entityId,
      ] = args;
      for (const [key, row] of this.db.rows) {
        if (
          this.matchesPartition(
            row,
            workProfileId,
            authSubject,
            tenantScopeKind,
            tenantId,
            dataMode,
          ) &&
          row.kind === String(kind) &&
          row.entity_id === String(entityId)
        ) {
          this.db.rows.delete(key);
        }
      }
    }
  }
}

class FakeDb {
  readonly tables = new Set<string>();
  readonly columns = new Map<string, Set<string>>();
  readonly rows = new Map<string, EntityRow>();
  prepareCalls = 0;
  readAttempts = 0;

  prepare(sql: string): FakeStatement {
    this.prepareCalls += 1;
    if (sql.includes(`FROM ${TABLE}`) || sql.includes(`INTO ${TABLE}`)) {
      this.readAttempts += 1;
    }
    return new FakeStatement(sql, this);
  }

  exec(sql: string): void {
    const normalized = sql.replace(/\s+/g, " ");
    if (normalized.includes(`CREATE TABLE IF NOT EXISTS ${TABLE}`)) {
      this.tables.add(TABLE);
      this.columns.set(
        TABLE,
        new Set([
          "work_profile_id",
          "auth_subject",
          "tenant_scope_kind",
          "tenant_id",
          "data_mode",
          "kind",
          "entity_id",
          "title",
          "permission_json",
          "payload_json",
          "updated_at",
        ]),
      );
    }
  }
}

const PARTITION_A: KnowledgeJobPartition = {
  workProfileId: "wp-a",
  authSubject: "user-a",
  tenantScope: { kind: "personal" },
};

const PARTITION_B: KnowledgeJobPartition = {
  workProfileId: "wp-b",
  authSubject: "user-b",
  tenantScope: { kind: "tenant", tenantId: "t-1" },
};

const KINDS: KnowledgeFacadeEntityKind[] = [
  "base",
  "set",
  "document",
  "session",
  "citation",
];

function modeSnapshot(
  dataMode: KnowledgeActiveDataMode,
): KnowledgeModeSnapshot {
  return {
    dataMode,
    allowSyntheticData: dataMode === "mock",
    configSource: dataMode === "mock" ? "env" : "default",
  };
}

describe("knowledge-provider-facade (V02)", () => {
  let fakeDb: FakeDb;
  let partition: KnowledgeJobPartition;
  let mode: KnowledgeActiveDataMode;

  beforeEach(() => {
    fakeDb = new FakeDb();
    mockedGetDbConnection.mockImplementation(() => fakeDb as never);
    partition = PARTITION_A;
    mode = "mock";
    resetKnowledgeMockStoreForTests();
    resetKnowledgeProviderFacadeForTests();
  });

  afterEach(() => {
    resetKnowledgeMockStoreForTests();
    resetKnowledgeProviderFacadeForTests();
    vi.clearAllMocks();
  });

  function createFacade(): KnowledgeProviderFacade {
    return new KnowledgeProviderFacade({
      getMode: () => modeSnapshot(mode),
      getPartition: () => partition,
    });
  }

  it("lists and mutates synthetic bases/sets/documents/sessions/citations in mock mode", () => {
    const facade = createFacade();
    for (const kind of KINDS) {
      const created = facade.mutateEntity({
        kind,
        patch: { title: `Demo ${kind}` },
      });
      expect(created.kind).toBe(kind);
      expect(created.dataMode).toBe("mock");
      expect(created.partition).toEqual(PARTITION_A);
      expect(created.title).toBe(`Demo ${kind}`);
      expect(created.permission).toEqual(
        expect.objectContaining({
          role: expect.any(String),
          visibility: expect.any(String),
        }),
      );
      // Display-only: must not look like an authorization grant.
      expect(created.permission).not.toHaveProperty("canAuthorize");
      expect(created.permission).not.toHaveProperty("grants");

      const listed = facade.listEntities({ kind });
      expect(listed.some((e) => e.id === created.id)).toBe(true);

      const got = facade.getEntity({ kind, entityId: created.id });
      expect(got?.id).toBe(created.id);

      const renamed = facade.mutateEntity({
        kind,
        entityId: created.id,
        patch: { title: `Updated ${kind}` },
      });
      expect(renamed.title).toBe(`Updated ${kind}`);
    }
  });

  it("provider mode returns unavailable/empty and never reads mock store", () => {
    // Seed mock data under mock mode first.
    mode = "mock";
    const seedFacade = createFacade();
    seedFacade.mutateEntity({ kind: "base", patch: { title: "Seeded base" } });
    expect(fakeDb.rows.size).toBeGreaterThan(0);

    const readsBefore = fakeDb.readAttempts;
    mode = "provider";
    const facade = createFacade();

    expect(facade.listEntities({ kind: "base" })).toEqual([]);
    expect(facade.getEntity({ kind: "base", entityId: "any" })).toBeNull();
    expect(() =>
      facade.mutateEntity({ kind: "base", patch: { title: "Nope" } }),
    ).toThrow(KnowledgeFacadeUnavailableError);

    expect(fakeDb.readAttempts).toBe(readsBefore);
  });

  it("denies cross-partition reads of mock entities", () => {
    mode = "mock";
    const facadeA = createFacade();
    const created = facadeA.mutateEntity({
      kind: "document",
      patch: { title: "Private doc" },
    });

    partition = PARTITION_B;
    const facadeB = createFacade();
    expect(facadeB.listEntities({ kind: "document" })).toEqual([]);
    expect(
      facadeB.getEntity({ kind: "document", entityId: created.id }),
    ).toBeNull();
    expect(() =>
      facadeB.mutateEntity({
        kind: "document",
        entityId: created.id,
        patch: { title: "Hijack" },
      }),
    ).toThrow(KnowledgeFacadePartitionDeniedError);
  });

  it("selects exactly one adapter from current mode", () => {
    mode = "mock";
    const facade = createFacade();
    expect(facade.activeAdapterKind()).toBe("mock");
    mode = "provider";
    expect(facade.activeAdapterKind()).toBe("remote");
  });

  it("does not import apps/knowledge at runtime", () => {
    const roots = [
      "knowledge-provider-facade.ts",
      "knowledge-mock-adapter.ts",
      "knowledge-mock-store.ts",
    ];
    for (const file of roots) {
      const src = readFileSync(join(__dirname, file), "utf8");
      expect(src).not.toMatch(
        /from\s+["'][^"']*apps\/knowledge|import\s+["'][^"']*apps\/knowledge|from\s+["']@\/|mock-knowledge-repository/,
      );
    }
  });

  it("seeds minimal fixtures so list is non-empty after ensureSeeded", () => {
    mode = "mock";
    const facade = createFacade();
    facade.ensureSeeded();
    for (const kind of KINDS) {
      expect(facade.listEntities({ kind }).length).toBeGreaterThan(0);
    }
  });

  it("keeps mock list/mutate available when sqlite cannot open", () => {
    mockedGetDbConnection.mockReturnValue(null);
    mode = "mock";
    const facade = createFacade();
    facade.ensureSeeded();
    expect(facade.listEntities({ kind: "base" }).length).toBeGreaterThan(0);

    const created = facade.mutateEntity({
      kind: "set",
      patch: { title: "Memory-only set" },
    });
    expect(created.title).toBe("Memory-only set");
    expect(facade.listEntities({ kind: "set" }).some((e) => e.id === created.id)).toBe(
      true,
    );
  });
});
