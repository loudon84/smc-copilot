// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockCtor } = vi.hoisted(() => ({
  mockCtor: vi.fn(),
}));

vi.mock("better-sqlite3", () => ({
  default: function MockBetterSqlite3(
    filename: string,
    options?: { readonly?: boolean },
  ) {
    return mockCtor(filename, options);
  },
}));

import { openSqliteDatabase, resetSqliteDatabaseForTests } from "./sqlite-database";

describe("openSqliteDatabase", () => {
  afterEach(() => {
    resetSqliteDatabaseForTests();
    mockCtor.mockReset();
  });

  it("uses better-sqlite3 when the native addon loads", () => {
    const native = { kind: "native" };
    mockCtor.mockReturnValue(native);

    const db = openSqliteDatabase("C:/tmp/state.db", { readonly: true });

    expect(db).toBe(native);
    expect(mockCtor).toHaveBeenCalledWith("C:/tmp/state.db", { readonly: true });
  });

  it("falls back to node:sqlite when the native bindings file is missing", () => {
    mockCtor.mockImplementation(() => {
      throw new Error("Could not locate the bindings file. Tried:\n → better_sqlite3.node");
    });

    const db = openSqliteDatabase(":memory:");
    db.exec("CREATE TABLE t (id INTEGER)");
    db.prepare("INSERT INTO t (id) VALUES (?)").run(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM t").get() as { n: number }).toEqual({
      n: 1,
    });
    db.close();
  });

  it("falls back to node:sqlite after an Electron ABI mismatch", () => {
    const err = new Error(
      "The module was compiled against a different Node.js version using NODE_MODULE_VERSION 137",
    );
    (err as { code?: string }).code = "ERR_DLOPEN_FAILED";
    mockCtor.mockImplementation(() => {
      throw err;
    });

    const db = openSqliteDatabase(":memory:");
    db.exec("CREATE TABLE t (id INTEGER, title TEXT)");
    db.prepare("INSERT INTO t (id, title) VALUES (?, ?)").run(1, "demo");
    const row = db.prepare("SELECT title FROM t WHERE id = ?").get(1) as {
      title: string;
    };
    expect(row.title).toBe("demo");

    const listed = db.prepare("SELECT * FROM t").all() as Array<{ id: number }>;
    expect(listed).toHaveLength(1);

    const tx = db.transaction((title: string) => {
      db.prepare("UPDATE t SET title = ? WHERE id = 1").run(title);
    });
    tx("updated");
    expect(
      (db.prepare("SELECT title FROM t WHERE id = 1").get() as { title: string })
        .title,
    ).toBe("updated");

    db.close();
  });
});
