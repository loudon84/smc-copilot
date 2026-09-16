/**
 * Open a SQLite connection with better-sqlite3 when the Electron ABI matches.
 * If the native addon was built for a different NODE_MODULE_VERSION (common
 * after `npm install` without Visual Studio), fall back to built-in node:sqlite.
 */
import BetterSqlite3 from "better-sqlite3";
import { DatabaseSync } from "node:sqlite";

export type SqliteDatabase = BetterSqlite3.Database;
export type SqliteOpenOptions = BetterSqlite3.Options;

let nativeBroken = false;
let fallbackLogged = false;

function isNativeLoadError(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  const message = err instanceof Error ? err.message : String(err);
  return (
    code === "ERR_DLOPEN_FAILED" ||
    message.includes("NODE_MODULE_VERSION") ||
    message.includes("ERR_DLOPEN_FAILED") ||
    message.includes("Could not locate the bindings file") ||
    message.includes("The specified module could not be found")
  );
}

function logFallbackOnce(): void {
  if (fallbackLogged) return;
  fallbackLogged = true;
  console.warn(
    "[db] better-sqlite3 native module is incompatible with this Electron; using built-in node:sqlite",
  );
}

class BuiltinStatement {
  constructor(private readonly stmt: ReturnType<DatabaseSync["prepare"]>) {}

  all(...args: unknown[]): unknown[] {
    const rows = this.stmt.all(...(args as never[]));
    return Array.isArray(rows) ? rows : [];
  }

  get(...args: unknown[]): unknown {
    return this.stmt.get(...(args as never[]));
  }

  run(...args: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    const result = this.stmt.run(...(args as never[]));
    return {
      changes: Number(result.changes ?? 0),
      lastInsertRowid: result.lastInsertRowid,
    };
  }
}

class BuiltinSqliteDatabase {
  constructor(private readonly inner: DatabaseSync) {}

  exec(sql: string): this {
    this.inner.exec(sql);
    return this;
  }

  prepare(sql: string): BuiltinStatement {
    return new BuiltinStatement(this.inner.prepare(sql));
  }

  pragma(source: string): unknown {
    const sql = /^\s*PRAGMA\s/i.test(source) ? source : `PRAGMA ${source}`;
    try {
      return this.inner.prepare(sql).all();
    } catch {
      this.inner.exec(sql);
      return undefined;
    }
  }

  transaction<Args extends unknown[], Result>(
    fn: (...args: Args) => Result,
  ): (...args: Args) => Result {
    return (...args: Args) => {
      this.inner.exec("BEGIN");
      try {
        const result = fn(...args);
        this.inner.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          this.inner.exec("ROLLBACK");
        } catch {
          /* ignore rollback failure */
        }
        throw error;
      }
    };
  }

  close(): void {
    this.inner.close();
  }
}

function openBuiltinSqlite(
  filename: string,
  options?: SqliteOpenOptions,
): SqliteDatabase {
  const db = new DatabaseSync(filename, {
    readOnly: Boolean(options?.readonly),
  });
  return new BuiltinSqliteDatabase(db) as unknown as SqliteDatabase;
}

function asDatabaseConstructor(
  mod: unknown,
): (new (filename: string, options?: SqliteOpenOptions) => SqliteDatabase) | null {
  if (typeof mod === "function") {
    return mod as new (
      filename: string,
      options?: SqliteOpenOptions,
    ) => SqliteDatabase;
  }
  if (mod && typeof mod === "object" && "default" in mod) {
    const inner = (mod as { default: unknown }).default;
    if (typeof inner === "function") {
      return inner as new (
        filename: string,
        options?: SqliteOpenOptions,
      ) => SqliteDatabase;
    }
  }
  return null;
}

export function openSqliteDatabase(
  filename: string,
  options?: SqliteOpenOptions,
): SqliteDatabase {
  if (!nativeBroken) {
    const Native = asDatabaseConstructor(BetterSqlite3);
    if (Native) {
      try {
        return new Native(filename, options);
      } catch (err) {
        if (!isNativeLoadError(err)) throw err;
        nativeBroken = true;
        logFallbackOnce();
      }
    }
  }
  return openBuiltinSqlite(filename, options);
}

export function resetSqliteDatabaseForTests(): void {
  nativeBroken = false;
  fallbackLogged = false;
}
