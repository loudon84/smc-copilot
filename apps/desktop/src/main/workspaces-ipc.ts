import { ipcMain } from "electron";
import { execFile } from "child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, normalize, resolve, sep } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
import { profileHome } from "./config-importer";
import { getProfile } from "./profile-runtime-db";

const PREVIEW_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".yaml",
  ".yml",
  ".html",
  ".css",
  ".xml",
  ".csv",
  ".log",
]);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

function resolveSafePath(profileId: string, relativePath: string): string | null {
  const profile = getProfile(profileId);
  const homeName = profile?.name ?? profileId;
  const rootNorm = resolve(profileHome(homeName));
  const target = resolve(rootNorm, normalize(relativePath || ".").replace(/^(\.\.(\/|\\|$))+/, ""));
  const rootPrefix = rootNorm.endsWith(sep) ? rootNorm : rootNorm + sep;
  if (target !== rootNorm && !target.startsWith(rootPrefix)) {
    return null;
  }
  return target;
}

export interface WorkspaceFileEntryDto {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
}

export interface WorkspaceGitStatusDto {
  branch: string | null;
  dirtyCount: number;
}

function profileHomeDir(profileId: string): string {
  const profile = getProfile(profileId);
  const homeName = profile?.name ?? profileId;
  return resolve(profileHome(homeName));
}

async function queryGitStatus(home: string): Promise<WorkspaceGitStatusDto> {
  const gitDir = join(home, ".git");
  if (!existsSync(gitDir)) {
    return { branch: null, dirtyCount: 0 };
  }
  try {
    const [branchResult, statusResult] = await Promise.all([
      execFileAsync("git", ["-C", home, "rev-parse", "--abbrev-ref", "HEAD"], {
        timeout: 3000,
      }),
      execFileAsync("git", ["-C", home, "status", "--porcelain"], { timeout: 3000 }),
    ]);
    const branch = String(branchResult.stdout).trim() || null;
    const dirtyCount = String(statusResult.stdout)
      .split("\n")
      .filter((line) => line.trim().length > 0).length;
    return { branch, dirtyCount };
  } catch {
    return { branch: null, dirtyCount: 0 };
  }
}

export function setupWorkspacesIPC(): void {
  ipcMain.handle("workspaces:git-status", async (_event, profileId: string) => {
    const home = profileHomeDir(profileId);
    return queryGitStatus(home);
  });

  ipcMain.handle(
    "workspaces:list-files",
    async (_event, profileId: string, relativePath = ".") => {
      const target = resolveSafePath(profileId, relativePath);
      if (!target || !existsSync(target)) {
        return [] as WorkspaceFileEntryDto[];
      }
      const st = statSync(target);
      if (!st.isDirectory()) {
        return [] as WorkspaceFileEntryDto[];
      }
      const entries = readdirSync(target, { withFileTypes: true });
      const root = resolve(profileHome(getProfile(profileId)?.name ?? profileId));
      return entries
        .filter((e) => !e.name.startsWith("."))
        .map((e) => {
          const full = join(target, e.name);
          const rel = full.slice(root.length).replace(/\\/g, "/").replace(/^\//, "") || e.name;
          const stat = statSync(full);
          return {
            name: e.name,
            path: rel,
            isDirectory: e.isDirectory(),
            size: stat.isFile() ? stat.size : undefined,
          };
        })
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    },
  );

  ipcMain.handle(
    "workspaces:read-file",
    async (_event, profileId: string, relativePath: string) => {
      const target = resolveSafePath(profileId, relativePath);
      if (!target || !existsSync(target)) {
        return { ok: false as const, error: "FILE_NOT_FOUND" };
      }
      const st = statSync(target);
      if (!st.isFile()) {
        return { ok: false as const, error: "NOT_A_FILE" };
      }
      const ext = target.slice(target.lastIndexOf(".")).toLowerCase();
      if (!PREVIEW_EXTENSIONS.has(ext) && !IMAGE_EXTENSIONS.has(ext)) {
        return { ok: false as const, error: "UNSUPPORTED_TYPE" };
      }
      const maxBytes = IMAGE_EXTENSIONS.has(ext) ? 512 * 1024 : 256 * 1024;
      if (st.size > maxBytes) {
        return { ok: false as const, error: "FILE_TOO_LARGE" };
      }
      const encoding = IMAGE_EXTENSIONS.has(ext) ? ("base64" as const) : ("utf8" as const);
      const content = readFileSync(target, encoding);
      return {
        ok: true as const,
        content,
        encoding,
        path: relativePath,
        size: st.size,
      };
    },
  );
}
