import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  copyFileSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { join, parse } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { getDesktopAgentDir, getDesktopAgentRuntimeDir } from "./windows/path-resolver";
import {
  validateGitUrl,
  validateGitBranch,
  execGitSync,
  safeExtractZip,
} from "./command-security-guard";

const isWindows = process.platform === "win32";

function safeMoveSync(src: string, dest: string): void {
  try {
    renameSync(src, dest);
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.message.includes("EXDEV") || err.message.includes("cross-device"))
    ) {
      const srcStat = statSync(src);
      if (srcStat.isFile()) {
        copyFileSync(src, dest);
        unlinkSync(src);
      } else if (srcStat.isDirectory()) {
        mkdirSync(dest, { recursive: true });
        for (const entry of readdirSync(src)) {
          safeMoveSync(join(src, entry), join(dest, entry));
        }
        rmSync(src, { recursive: true });
      }
    } else {
      throw err;
    }
  }
}

function sameDrive(a: string, b: string): boolean {
  const rootA = parse(a).root.toLowerCase();
  const rootB = parse(b).root.toLowerCase();
  return rootA === rootB;
}

async function extractZip(zipPath: string, targetDir: string): Promise<void> {
  mkdirSync(targetDir, { recursive: true });

  if (isWindows) {
    safeExtractZip(zipPath, targetDir, { timeout: 300000 });
  } else {
    execFileSync("unzip", ["-o", zipPath, "-d", targetDir], {
      encoding: "utf-8",
      timeout: 300000,
    });
  }
}

function isSingleSubdir(dir: string): string | null {
  const entries = readdirSync(dir).filter((e) => !e.startsWith("."));
  if (entries.length === 1) {
    const sub = join(dir, entries[0]);
    try {
      if (statSync(sub).isDirectory()) return sub;
    } catch {
      /* not a dir */
    }
  }
  return null;
}

function hasProjectFiles(dir: string): boolean {
  return (
    existsSync(join(dir, "pyproject.toml")) || existsSync(join(dir, "setup.py"))
  );
}

function promoteSubdir(targetDir: string): string {
  if (hasProjectFiles(targetDir)) return targetDir;

  const sub = isSingleSubdir(targetDir);
  if (sub && hasProjectFiles(sub)) {
    const tmpStage = join(targetDir, `.hermes-promote-${randomUUID()}`);
    mkdirSync(tmpStage, { recursive: true });

    const entries = readdirSync(sub);
    for (const entry of entries) {
      safeMoveSync(join(sub, entry), join(tmpStage, entry));
    }

    try {
      rmSync(sub, { recursive: true });
    } catch {
      /* keep empty dir */
    }

    for (const entry of readdirSync(tmpStage)) {
      safeMoveSync(join(tmpStage, entry), join(targetDir, entry));
    }
    try {
      rmSync(tmpStage, { recursive: true });
    } catch {
      /* cleanup */
    }

    return targetDir;
  }

  const deepEntries = readdirSync(targetDir);
  for (const entry of deepEntries) {
    const candidate = join(targetDir, entry);
    try {
      if (statSync(candidate).isDirectory() && hasProjectFiles(candidate)) {
        return candidate;
      }
    } catch {
      /* skip */
    }
  }

  return targetDir;
}

export interface AgentInstallProgress {
  stage: "extracting" | "cloning" | "checking-out" | "completed";
  message: string;
}

export type AgentProgressCallback = (progress: AgentInstallProgress) => void;

export interface AgentInstallResult {
  ok: boolean;
  agentPath?: string;
  version?: string;
  errorCode?: string;
  message?: string;
}

export type UserSourceType = "local-zip" | "git-clone";

export interface UserSourceConfig {
  sourceType: UserSourceType;
  localZipPath?: string;
  gitUrl?: string;
  gitBranch?: string;
  gitShallow?: boolean;
  /** PyPI simple index URL (e.g. intranet mirror) */
  pipIndexUrl?: string;
  trustedHost?: string;
  pipMirrorPreset?: string;
}

export async function installHermesAgentFromUserSource(
  userConfig: UserSourceConfig,
  onProgress?: AgentProgressCallback,
): Promise<AgentInstallResult> {
  const agentTargetPath = getDesktopAgentDir();
  const runtimeDir = getDesktopAgentRuntimeDir();

  if (existsSync(agentTargetPath) && hasProjectFiles(agentTargetPath)) {
    onProgress?.({
      stage: "completed",
      message: `hermes-agent already exists at ${agentTargetPath}`,
    });
    return { ok: true, agentPath: agentTargetPath };
  }

  if (existsSync(agentTargetPath) && readdirSync(agentTargetPath).length > 0) {
    try {
      rmSync(agentTargetPath, { recursive: true });
    } catch {
      /* partial cleanup */
    }
  }
  mkdirSync(runtimeDir, { recursive: true });
  mkdirSync(agentTargetPath, { recursive: true });

  switch (userConfig.sourceType) {
    case "local-zip": {
      const zipPath = userConfig.localZipPath;
      if (!zipPath || !existsSync(zipPath)) {
        return {
          ok: false,
          errorCode: "E_AGENT_SOURCE_NOT_FOUND",
          message: `ZIP file does not exist: ${zipPath || "(not specified)"}`,
        };
      }
      onProgress?.({
        stage: "extracting",
        message: `Extracting ${zipPath} to ${agentTargetPath}...`,
      });
      try {
        await extractZip(zipPath, agentTargetPath);
        const resolvedPath = promoteSubdir(agentTargetPath);
        if (resolvedPath !== agentTargetPath) {
          onProgress?.({
            stage: "extracting",
            message: `Detected subdirectory structure, source path: ${resolvedPath}`,
          });
        }
      } catch (err) {
        return {
          ok: false,
          errorCode: "E_BUNDLE_EXTRACT_FAILED",
          message: `Extraction failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      break;
    }

    case "git-clone": {
      const gitUrl = userConfig.gitUrl;
      if (!gitUrl) {
        return {
          ok: false,
          errorCode: "E_GIT_CLONE_FAILED",
          message: "Git URL is empty",
        };
      }

      const urlValidation = validateGitUrl(gitUrl);
      if (!urlValidation.valid) {
        return {
          ok: false,
          errorCode: "E_GIT_URL_INVALID",
          message: urlValidation.reason!,
        };
      }

      if (userConfig.gitBranch) {
        const branchValidation = validateGitBranch(userConfig.gitBranch);
        if (!branchValidation.valid) {
          return {
            ok: false,
            errorCode: "E_GIT_BRANCH_INVALID",
            message: branchValidation.reason!,
          };
        }
      }

      onProgress?.({ stage: "cloning", message: `Cloning ${gitUrl}...` });

      const cloneArgs = ["clone"];
      if (userConfig.gitShallow !== false) cloneArgs.push("--depth", "1");
      if (userConfig.gitBranch) cloneArgs.push("-b", userConfig.gitBranch);
      cloneArgs.push(gitUrl, agentTargetPath);

      try {
        execGitSync(cloneArgs, {
          timeout: 300000,
          env: process.env as Record<string, string>,
        });
      } catch (err) {
        return {
          ok: false,
          errorCode: "E_GIT_CLONE_FAILED",
          message: `Git clone failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      break;
    }
  }

  if (!hasProjectFiles(agentTargetPath)) {
    return {
      ok: false,
      errorCode: "E_AGENT_SOURCE_NOT_FOUND",
      message: `pyproject.toml or setup.py not found, extraction may be incorrect`,
    };
  }

  onProgress?.({
    stage: "completed",
    message: `hermes-agent installed successfully -> ${agentTargetPath}`,
  });
  return { ok: true, agentPath: agentTargetPath };
}

export async function installHermesAgentSource(
  _config: unknown,
  _runtimePath: string,
  onProgress?: AgentProgressCallback,
): Promise<AgentInstallResult> {
  const agentTargetPath = getDesktopAgentDir();
  if (existsSync(agentTargetPath) && hasProjectFiles(agentTargetPath)) {
    onProgress?.({
      stage: "completed",
      message: `hermes-agent already exists`,
    });
    return { ok: true, agentPath: agentTargetPath };
  }
  return {
    ok: false,
    errorCode: "E_AGENT_SOURCE_NOT_FOUND",
    message:
      "hermes-agent is not installed, please select an install source during first-run setup",
  };
}
