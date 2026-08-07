import type { DoctorCheckResult } from "../../../shared/enterprise/enterprise-schema";

export function checkProfileDb(dbPath: string): DoctorCheckResult {
  const start = Date.now();
  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const result = db.pragma("integrity_check");
    db.close();
    const ok = result?.[0]?.integrity_check === "ok";
    return { id: "profile-db", name: "Profile DB 完整性", status: ok ? "pass" : "fail", message: ok ? "DB 完整" : "DB 损坏", durationMs: Date.now() - start };
  } catch (err) {
    return { id: "profile-db", name: "Profile DB 完整性", status: "fail", message: `DB 检查失败: ${err instanceof Error ? err.message : String(err)}`, durationMs: Date.now() - start };
  }
}
