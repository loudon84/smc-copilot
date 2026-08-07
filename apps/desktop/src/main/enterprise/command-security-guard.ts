import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const SHELL_META_CHARS = /[`$|;&<>(){}\\!#~*?[\]]/;

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
}

export interface BranchValidationResult {
  valid: boolean;
  reason?: string;
}

const GIT_URL_PATTERNS = [
  /^https?:\/\/.+/i,
  /^git:\/\/.+/i,
  /^ssh:\/\/.+/i,
  /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+:.+/,
];

export function validateGitUrl(url: string): UrlValidationResult {
  if (!url || url.trim().length === 0) {
    return { valid: false, reason: "Git URL is empty" };
  }

  if (SHELL_META_CHARS.test(url)) {
    return { valid: false, reason: "Git URL contains shell meta characters" };
  }

  const matchesKnownProtocol = GIT_URL_PATTERNS.some((p) => p.test(url));
  if (!matchesKnownProtocol) {
    return {
      valid: false,
      reason:
        "Git URL does not match known protocol (https://, git://, ssh://, or SCP-style)",
    };
  }

  return { valid: true };
}

export function validateGitBranch(branch: string): BranchValidationResult {
  if (!branch || branch.trim().length === 0) {
    return { valid: false, reason: "Branch name is empty" };
  }

  if (SHELL_META_CHARS.test(branch)) {
    return {
      valid: false,
      reason: "Branch name contains shell meta characters",
    };
  }

  if (/\s/.test(branch)) {
    return { valid: false, reason: "Branch name contains spaces" };
  }

  if (
    /[/\\]/.test(branch) &&
    branch.split("/").some((seg) => seg === ".." || seg === ".")
  ) {
    return {
      valid: false,
      reason: "Branch name contains path traversal segments",
    };
  }

  return { valid: true };
}

export interface ExecOptions {
  encoding?: BufferEncoding;
  timeout?: number;
  cwd?: string;
  env?: Record<string, string | undefined>;
}

export function execGitSync(args: string[], options?: ExecOptions): string {
  return execFileSync("git", args, {
    encoding: options?.encoding || "utf-8",
    timeout: options?.timeout || 300000,
    cwd: options?.cwd,
    env: options?.env || process.env,
  });
}

export function execPowerShellSync(
  args: string[],
  options?: ExecOptions,
): string {
  const fullArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", ...args];
  return execFileSync("powershell", fullArgs, {
    encoding: options?.encoding || "utf-8",
    timeout: options?.timeout || 300000,
    cwd: options?.cwd,
    env: options?.env || process.env,
  });
}

export function safeExtractZip(
  zipPath: string,
  targetDir: string,
  options?: ExecOptions,
): string {
  if (!existsSync(zipPath)) {
    throw new Error(`ZIP file does not exist: ${zipPath}`);
  }

  return execPowerShellSync(
    [
      "-Command",
      "Expand-Archive",
      "-LiteralPath",
      zipPath,
      "-DestinationPath",
      targetDir,
      "-Force",
    ],
    options,
  );
}
