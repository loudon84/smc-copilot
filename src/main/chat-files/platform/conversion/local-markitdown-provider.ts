/**
 * Local MarkItDown CLI adapter — spawn only; never shell-interpolate paths.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { existsSync } from "fs";
import { FilePlatformError } from "../file-security";
import type {
  DocumentConversionInput,
  DocumentConversionProvider,
  DocumentConversionResult,
} from "./document-conversion-provider";

export const DEFAULT_MARKITDOWN_TIMEOUT_MS = 60_000;
export const DEFAULT_MARKITDOWN_STDOUT_MAX = 12 * 1024 * 1024; // 12 MB
export const DEFAULT_MARKITDOWN_STDERR_MAX = 32 * 1024; // 32 KB

export interface LocalMarkItDownOptions {
  /** Absolute path or bare command name (e.g. markitdown). */
  bin?: string;
  timeoutMs?: number;
  stdoutMaxBytes?: number;
  stderrMaxBytes?: number;
  /** Injected for tests. */
  spawnFn?: typeof spawn;
  /** Override PATH / env for the child. */
  env?: NodeJS.ProcessEnv;
}

type ResolvedCommand = {
  command: string;
  argsPrefix: string[];
};

let availabilityCache: { value: boolean; at: number } | null = null;
const AVAILABILITY_TTL_MS = 60_000;

function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function resolvePythonCommands(): string[] {
  if (process.platform === "win32") {
    return ["py", "python", "python3"];
  }
  return ["python3", "python"];
}

/**
 * Resolve how to invoke MarkItDown for this machine.
 * Prefer explicit bin, then `markitdown` on PATH, then `python -m markitdown`.
 */
export function resolveMarkItDownCommand(bin?: string): ResolvedCommand | null {
  const trimmed = bin?.trim();
  if (trimmed) {
    if (trimmed.includes("://") || /[\r\n]/.test(trimmed)) {
      return null;
    }
    return { command: trimmed, argsPrefix: [] };
  }
  return { command: "markitdown", argsPrefix: [] };
}

function candidateCommands(bin?: string): ResolvedCommand[] {
  const out: ResolvedCommand[] = [];
  const primary = resolveMarkItDownCommand(bin);
  if (primary) out.push(primary);
  if (!bin?.trim()) {
    for (const command of resolvePythonCommands()) {
      out.push({ command, argsPrefix: ["-m", "markitdown"] });
    }
  }
  return out;
}

function isCommandNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

function runOnce(
  command: string,
  args: string[],
  options: {
    timeoutMs: number;
    stdoutMax: number;
    stderrMax: number;
    signal?: AbortSignal;
    spawnFn: typeof spawn;
    env: NodeJS.ProcessEnv;
  },
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      const err = new Error("MarkItDown aborted");
      err.name = "AbortError";
      reject(err);
      return;
    }

    let child: ChildProcessWithoutNullStreams;
    try {
      child = options.spawnFn(command, args, {
        shell: false,
        windowsHide: true,
        env: options.env,
        stdio: ["ignore", "pipe", "pipe"],
      }) as unknown as ChildProcessWithoutNullStreams;
    } catch (err) {
      reject(err);
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLen = 0;
    let stderrLen = 0;
    let settled = false;
    let timedOut = false;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      fn();
    };

    const killChild = (): void => {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      const t = setTimeout(() => {
        try {
          if (!child.killed) child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }, 1000);
      t.unref?.();
    };

    const onAbort = (): void => {
      killChild();
      finish(() => {
        const err = new Error("MarkItDown aborted");
        err.name = "AbortError";
        reject(err);
      });
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      killChild();
      finish(() => {
        reject(
          FilePlatformError.fromCode(
            "FILE_PARSE_FAILED",
            `MarkItDown timed out after ${options.timeoutMs}ms`,
            { retryable: true },
          ),
        );
      });
    }, options.timeoutMs);
    timer.unref?.();

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdoutLen >= options.stdoutMax) return;
      const slice =
        chunk.length + stdoutLen > options.stdoutMax
          ? chunk.subarray(0, options.stdoutMax - stdoutLen)
          : chunk;
      stdoutChunks.push(slice);
      stdoutLen += slice.length;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderrLen >= options.stderrMax) return;
      const slice =
        chunk.length + stderrLen > options.stderrMax
          ? chunk.subarray(0, options.stderrMax - stderrLen)
          : chunk;
      stderrChunks.push(slice);
      stderrLen += slice.length;
    });

    child.on("error", (err) => {
      finish(() => reject(err));
    });

    child.on("close", (code) => {
      if (timedOut) return;
      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = truncateText(
        Buffer.concat(stderrChunks).toString("utf-8"),
        options.stderrMax,
      );
      finish(() => resolve({ stdout, stderr, code }));
    });
  });
}

/**
 * Probe whether MarkItDown can be launched (cached briefly).
 */
export async function probeMarkItDownAvailable(
  options?: LocalMarkItDownOptions,
): Promise<boolean> {
  const now = Date.now();
  if (
    availabilityCache &&
    now - availabilityCache.at < AVAILABILITY_TTL_MS &&
    !options?.bin
  ) {
    return availabilityCache.value;
  }

  try {
    const provider = new LocalMarkItDownProvider({
      ...options,
      timeoutMs: Math.min(options?.timeoutMs ?? 5000, 5000),
    });
    await provider.probe();
    if (!options?.bin) {
      availabilityCache = { value: true, at: now };
    }
    return true;
  } catch {
    if (!options?.bin) {
      availabilityCache = { value: false, at: now };
    }
    return false;
  }
}

export function resetMarkItDownAvailabilityCache(): void {
  availabilityCache = null;
}

// @lat: [[file-platform#MarkItDown conversion]]
export class LocalMarkItDownProvider implements DocumentConversionProvider {
  readonly id = "markitdown";
  private readonly timeoutMs: number;
  private readonly stdoutMaxBytes: number;
  private readonly stderrMaxBytes: number;
  private readonly bin?: string;
  private readonly spawnFn: typeof spawn;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: LocalMarkItDownOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_MARKITDOWN_TIMEOUT_MS;
    this.stdoutMaxBytes =
      options.stdoutMaxBytes ?? DEFAULT_MARKITDOWN_STDOUT_MAX;
    this.stderrMaxBytes =
      options.stderrMaxBytes ?? DEFAULT_MARKITDOWN_STDERR_MAX;
    this.bin = options.bin;
    this.spawnFn = options.spawnFn ?? spawn;
    this.env = options.env ?? process.env;
  }

  /** Lightweight availability check (`--help`). */
  async probe(): Promise<void> {
    const candidates = candidateCommands(this.bin);
    let lastErr: unknown;
    for (const resolved of candidates) {
      try {
        const result = await runOnce(
          resolved.command,
          [...resolved.argsPrefix, "--help"],
          {
            timeoutMs: Math.min(this.timeoutMs, 8000),
            stdoutMax: 64 * 1024,
            stderrMax: this.stderrMaxBytes,
            spawnFn: this.spawnFn,
            env: this.env,
          },
        );
        if (result.code === 0 || result.stdout || result.stderr) {
          return;
        }
        lastErr = new Error(`exit ${result.code}`);
      } catch (err) {
        lastErr = err;
        if (!isCommandNotFound(err)) {
          // Binary existed but --help failed oddly — still count as available.
          return;
        }
      }
    }
    throw FilePlatformError.fromCode(
      "FILE_NOT_IMPLEMENTED",
      "MarkItDown CLI is not available",
      {
        retryable: false,
        detail: lastErr instanceof Error ? lastErr.message : String(lastErr),
      },
    );
  }

  async convert(
    input: DocumentConversionInput,
  ): Promise<DocumentConversionResult> {
    if (!input.path || !existsSync(input.path)) {
      throw FilePlatformError.fromCode(
        "FILE_NOT_FOUND",
        "File is missing for MarkItDown conversion",
      );
    }

    const candidates = candidateCommands(this.bin);
    let lastErr: unknown;

    for (const resolved of candidates) {
      try {
        const result = await runOnce(
          resolved.command,
          [...resolved.argsPrefix, input.path],
          {
            timeoutMs: this.timeoutMs,
            stdoutMax: this.stdoutMaxBytes,
            stderrMax: this.stderrMaxBytes,
            signal: input.signal,
            spawnFn: this.spawnFn,
            env: this.env,
          },
        );

        if (result.code !== 0) {
          throw FilePlatformError.fromCode(
            "FILE_PARSE_FAILED",
            `MarkItDown exited with code ${result.code}`,
            {
              retryable: true,
              detail: result.stderr.slice(0, 500) || undefined,
            },
          );
        }

        const markdown = result.stdout.trim();
        if (!markdown) {
          throw FilePlatformError.fromCode(
            "FILE_PARSE_FAILED",
            "MarkItDown returned empty output",
            {
              retryable: true,
              detail: result.stderr.slice(0, 500) || undefined,
            },
          );
        }

        return {
          markdown,
          metadata: {
            provider: this.id,
            command: resolved.command,
            mime: input.mime,
          },
        };
      } catch (err) {
        lastErr = err;
        if (err instanceof Error && err.name === "AbortError") throw err;
        if (isCommandNotFound(err)) continue;
        if (err instanceof FilePlatformError) throw err;
        throw err;
      }
    }

    if (lastErr instanceof FilePlatformError) throw lastErr;
    throw FilePlatformError.fromCode(
      "FILE_NOT_IMPLEMENTED",
      "MarkItDown CLI is not available",
      {
        retryable: false,
        detail:
          lastErr instanceof Error ? lastErr.message : String(lastErr ?? ""),
      },
    );
  }
}

export function createLocalMarkItDownProvider(
  options?: LocalMarkItDownOptions,
): LocalMarkItDownProvider {
  return new LocalMarkItDownProvider(options);
}
