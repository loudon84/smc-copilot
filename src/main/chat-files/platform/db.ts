import Database from "better-sqlite3";
import { existsSync } from "fs";
import { activeStateDbPath } from "../../utils";

let cachedDb: Database.Database | null = null;
let cachedDbPath: string | null = null;
let cachedDbReadonly: boolean | null = null;

/**
 * Cached better-sqlite3 connection for the active profile state.db.
 * Used by desktop-owned session tables (context folder, model override).
 */
export function getDbConnection(readonly = true): Database.Database | null {
  const dbPath = activeStateDbPath();
  if (!existsSync(dbPath)) {
    closeDbConnection();
    return null;
  }

  if (cachedDb && cachedDbPath === dbPath && cachedDbReadonly === readonly) {
    return cachedDb;
  }

  closeDbConnection();

  try {
    cachedDb = new Database(dbPath, readonly ? { readonly: true } : {});
    cachedDbPath = dbPath;
    cachedDbReadonly = readonly;
    return cachedDb;
  } catch (err) {
    console.error(`[chat-files/db] Failed to open database at ${dbPath}:`, err);
    return null;
  }
}

export function closeDbConnection(): void {
  if (cachedDb) {
    try {
      cachedDb.close();
    } catch (err) {
      console.error("[chat-files/db] Error closing database connection:", err);
    }
    cachedDb = null;
    cachedDbPath = null;
    cachedDbReadonly = null;
  }
}
