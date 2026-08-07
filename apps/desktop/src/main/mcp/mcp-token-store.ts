import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const MCP_TOKEN_DIR = () => join(app.getPath("userData"), "mcp-tokens");

function tokenPath(ref: string): string {
  const safe = ref.replace(/[^a-zA-Z0-9._-]/g, "_");
  return join(MCP_TOKEN_DIR(), `${safe}.enc`);
}

export function ensureMcpTokenDir(): void {
  const dir = MCP_TOKEN_DIR();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function storeMcpToken(ref: string, token: string): void {
  ensureMcpTokenDir();
  const path = tokenPath(ref);
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token);
    writeFileSync(path, encrypted);
  } else {
    writeFileSync(path, Buffer.from(token, "utf-8"));
  }
}

export function readMcpToken(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const path = tokenPath(ref);
  if (!existsSync(path)) return null;
  try {
    const data = readFileSync(path);
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(data);
    }
    return data.toString("utf-8");
  } catch {
    return null;
  }
}

export function deleteMcpToken(ref: string | null | undefined): void {
  if (!ref) return;
  const path = tokenPath(ref);
  if (existsSync(path)) {
    try {
      rmSync(path);
    } catch {
      /* ignore */
    }
  }
}

export function hasMcpToken(ref: string | null | undefined): boolean {
  if (!ref) return false;
  return existsSync(tokenPath(ref));
}
