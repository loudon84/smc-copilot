import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { HERMES_HOME } from "../installer";
import { initProfileRuntimeDb, insertAuditEvent, generateId } from "../profile-runtime-db";
import type { RoleLibraryRef, SyncRoleLibraryResult } from "../../shared/profile-roles/profile-role-contract";

const execFileAsync = promisify(execFile);

const DEFAULT_LOCAL_DIR = "agency-agents-zh";

function roleLibraryRoot(): string {
  return join(HERMES_HOME, "desktop", "role-library");
}

function resolveLocalPath(ref: RoleLibraryRef): string {
  const dirName = ref.localDir?.trim() || DEFAULT_LOCAL_DIR;
  return join(roleLibraryRoot(), dirName);
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    timeout: 120_000,
    windowsHide: true,
  });
  return stdout.trim();
}

async function getHeadCommit(repoPath: string): Promise<string | undefined> {
  try {
    return await runGit(repoPath, ["rev-parse", "HEAD"]);
  } catch {
    return undefined;
  }
}

function recordSyncAudit(
  status: "success" | "failed",
  payload: Record<string, unknown>,
  errorMessage: string | null,
): void {
  insertAuditEvent({
    id: generateId(),
    event_type: "profile_role",
    profile_id: null,
    source: "system",
    action: "sync_role_library",
    payload_json: JSON.stringify(payload),
    status,
    error_message: errorMessage,
  });
}

export async function syncRoleLibrary(ref: RoleLibraryRef): Promise<SyncRoleLibraryResult> {
  initProfileRuntimeDb();
  const localPath = resolveLocalPath(ref);
  const branch = ref.branch?.trim() || "main";

  try {
    mkdirSync(roleLibraryRoot(), { recursive: true });

    if (!existsSync(join(localPath, ".git"))) {
      if (existsSync(localPath)) {
        const error = `Role library path exists but is not a git repo: ${localPath}`;
        recordSyncAudit("failed", { repo: ref.repo, branch, localPath }, error);
        return { ok: false, localPath, error };
      }
      await execFileAsync(
        "git",
        ["clone", "--depth", "1", "--branch", branch, ref.repo, localPath],
        { timeout: 300_000, windowsHide: true },
      );
      const commit = await getHeadCommit(localPath);
      recordSyncAudit("success", { repo: ref.repo, branch, localPath, commit, mode: "clone" }, null);
      return { ok: true, localPath, commit };
    }

    await runGit(localPath, ["fetch", "origin", branch]);
    await runGit(localPath, ["checkout", branch]);
    await runGit(localPath, ["reset", "--hard", `origin/${branch}`]);
    const commit = await getHeadCommit(localPath);
    recordSyncAudit("success", { repo: ref.repo, branch, localPath, commit, mode: "update" }, null);
    return { ok: true, localPath, commit };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordSyncAudit("failed", { repo: ref.repo, branch, localPath }, message);
    return { ok: false, localPath, error: message };
  }
}

export function getRoleLibraryPath(ref?: Partial<RoleLibraryRef>): string {
  return resolveLocalPath({
    repo: ref?.repo ?? "https://github.com/jnMetaCode/agency-agents-zh.git",
    branch: ref?.branch,
    localDir: ref?.localDir,
  });
}
