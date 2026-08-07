import { existsSync } from "node:fs";
import { join } from "node:path";

/** Resolve pnpm executable path (Windows prefers %APPDATA%\\npm\\pnpm.cmd). */
export function findPnpm(): string {
  if (process.platform === "win32") {
    const pnpmPath = join(process.env.APPDATA ?? "", "npm", "pnpm.cmd");
    if (existsSync(pnpmPath)) return pnpmPath;
  }
  return "pnpm";
}
