import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDbConnection } from "./db";
import {
  deleteSessionModelOverrideForSession,
  getSessionModelOverride,
  migrateStoredSessionOverride,
  setSessionModelOverride,
} from "./session-model-override-store";

vi.mock("./db", () => ({
  getDbConnection: vi.fn(),
}));

const mockedGetDbConnection = vi.mocked(getDbConnection);

class FakeStatement {
  constructor(
    private readonly sql: string,
    private readonly db: FakeDb,
  ) {}

  get(sessionId?: string): unknown {
    if (this.sql.includes("sqlite_master")) {
      return this.db.tableCreated
        ? { name: "desktop_session_model_overrides" }
        : undefined;
    }
    if (this.sql.includes("SELECT provider, model, base_url")) {
      if (
        this.sql.includes("provider_ref") &&
        !this.db.columns.has("provider_ref")
      ) {
        const error = new Error("no such column: provider_ref");
        (error as { code?: string }).code = "SQLITE_ERROR";
        throw error;
      }
      return sessionId ? this.db.rows.get(sessionId) : undefined;
    }
    return undefined;
  }

  run(...args: string[]): void {
    if (this.sql.startsWith("DELETE")) {
      this.db.rows.delete(args[0]);
      return;
    }
    if (this.sql.startsWith("INSERT")) {
      const [
        sessionId,
        provider,
        model,
        baseUrl,
        providerRef,
        legacyProvider,
        legacyBaseUrl,
        migrationStatus,
      ] = args;
      this.db.rows.set(sessionId, {
        provider,
        model,
        base_url: baseUrl,
        provider_ref: providerRef || null,
        legacy_provider: legacyProvider || null,
        legacy_base_url: legacyBaseUrl || null,
        migration_status: migrationStatus || null,
      });
    }
  }

  all(): unknown[] {
    if (this.sql.startsWith("PRAGMA table_info")) {
      return [...this.db.columns].map((name) => ({ name }));
    }
    return [];
  }
}

class FakeDb {
  readonly rows = new Map<
    string,
    {
      provider: string;
      model: string;
      base_url: string;
      provider_ref?: string | null;
      legacy_provider?: string | null;
      legacy_base_url?: string | null;
      migration_status?: string | null;
    }
  >();
  tableCreated = false;
  columns = new Set<string>();

  exec(sql: string): void {
    const added = sql.match(/ADD COLUMN\s+(\w+)/i);
    if (added) {
      this.columns.add(added[1]);
      return;
    }
    if (/CREATE TABLE/i.test(sql)) {
      this.tableCreated = true;
      for (const name of [
        "session_id",
        "provider",
        "model",
        "base_url",
        "updated_at",
      ]) {
        this.columns.add(name);
      }
    }
  }

  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql.trim(), this);
  }

  close(): void {
    this.rows.clear();
  }
}

describe("session model override store", () => {
  let db: FakeDb;

  beforeEach(() => {
    db = new FakeDb();
    mockedGetDbConnection.mockReset();
    mockedGetDbConnection.mockReturnValue(db as never);
  });

  afterEach(() => {
    db.close();
  });

  it("stores and reads provider/model routing identity without credentials", () => {
    setSessionModelOverride("s1", {
      provider: "gemini",
      model: "gemini-2.5-pro",
      baseUrl: "",
    });

    expect(getSessionModelOverride("s1")).toEqual({
      provider: "gemini",
      model: "gemini-2.5-pro",
      baseUrl: "",
    });
    const columns = db
      .prepare("PRAGMA table_info(desktop_session_model_overrides)")
      .all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).not.toContain("api_key");
  });

  it("reads a pre-identity row after adding the missing columns", () => {
    db.tableCreated = true;
    db.columns = new Set([
      "session_id",
      "provider",
      "model",
      "base_url",
      "updated_at",
    ]);
    db.rows.set("legacy", {
      provider: "custom",
      model: "local-model",
      base_url: "http://localhost:11434/v1",
    });

    expect(getSessionModelOverride("legacy")).toEqual({
      provider: "custom",
      model: "local-model",
      baseUrl: "http://localhost:11434/v1",
    });
    expect(mockedGetDbConnection).toHaveBeenCalledWith(false);
  });

  it("clears and deletes saved overrides", () => {
    setSessionModelOverride("s1", {
      provider: "custom",
      model: "local-model",
      baseUrl: "http://localhost:11434/v1",
    });
    setSessionModelOverride("s1", null);
    expect(getSessionModelOverride("s1")).toBeNull();

    setSessionModelOverride("s2", {
      provider: "groq",
      model: "llama-3.3",
      baseUrl: "",
    });
    deleteSessionModelOverrideForSession(db as never, "s2");
    expect(getSessionModelOverride("s2")).toBeNull();
  });

  it("migrates one legacy session and leaves an ambiguous row unresolved", () => {
    setSessionModelOverride("ok", {
      provider: "custom",
      model: "deepseek-v4-flash",
      baseUrl: "https://new.example/v1",
    });
    const migrated = migrateStoredSessionOverride("ok", [
      {
        providerKey: "company",
        name: "Company",
        baseUrl: "https://new.example/v1",
      },
    ]);
    expect(migrated).toMatchObject({
      ok: true,
      override: {
        provider: "company",
        providerRef: "named:company",
        legacyProvider: "custom",
        migrationStatus: "migrated",
      },
    });

    setSessionModelOverride("bad", {
      provider: "custom",
      model: "m",
      baseUrl: "https://shared.example/v1",
    });
    expect(
      migrateStoredSessionOverride("bad", [
        { providerKey: "a", name: "A", baseUrl: "https://shared.example/v1" },
        { providerKey: "b", name: "B", baseUrl: "https://shared.example/v1" },
      ]),
    ).toEqual({ ok: false, error: "PROVIDER_IDENTITY_AMBIGUOUS" });
    expect(getSessionModelOverride("bad")?.providerRef).toBeUndefined();
    expect(getSessionModelOverride("bad")?.migrationStatus).toBeUndefined();
    expect(getSessionModelOverride("bad")?.provider).toBe("custom");
  });
});
