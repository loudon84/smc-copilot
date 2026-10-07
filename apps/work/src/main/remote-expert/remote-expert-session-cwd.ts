import { createHash } from "crypto";
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { app } from "electron";

function resolveUserDataRoot(override?: string): string {
  const fromArg = override?.trim() ?? "";
  if (fromArg) return fromArg;
  try {
    const fromApp = app.getPath("userData")?.trim() ?? "";
    if (fromApp) return fromApp;
  } catch {
    /* Electron app may be unavailable in unit tests */
  }
  return join(tmpdir(), "smc-work-remote-expert");
}

/**
 * Per-desktop-session absolute cwd for ACP session/new and session/resume.
 * Path: userData/remote-expert-acp/sessions/<sha256(desktopSessionId)>
 */
export function ensureRemoteExpertSessionCwd(
  desktopSessionId: string,
  userDataPath?: string,
): string {
  const id = desktopSessionId.trim();
  if (!id) {
    throw new Error("desktopSessionId required for remote expert cwd");
  }
  const root = resolveUserDataRoot(userDataPath);
  const digest = createHash("sha256").update(id, "utf8").digest("hex");
  const cwd = join(root, "remote-expert-acp", "sessions", digest);
  mkdirSync(cwd, { recursive: true });
  return cwd;
}
