import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface PowerShellRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
}

export function runPowerShellScript(
  scriptContent: string,
  opts?: {
    timeout?: number;
    cwd?: string;
    env?: Record<string, string>;
    logPath?: string;
  },
): PowerShellRunResult {
  const start = Date.now();
  const scriptPath = join(tmpdir(), `hermes-ps-${Date.now()}.ps1`);

  try {
    writeFileSync(scriptPath, scriptContent, "utf-8");

    const out = execSync(
      `powershell -ExecutionPolicy Bypass -NoProfile -File "${scriptPath}"`,
      {
        encoding: "utf-8",
        timeout: opts?.timeout || 120000,
        cwd: opts?.cwd,
        env: { ...process.env, ...opts?.env } as Record<string, string>,
      },
    );

    const result: PowerShellRunResult = {
      ok: true,
      stdout: out.trim(),
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - start,
    };

    if (opts?.logPath) {
      appendLog(opts.logPath, result);
    }

    return result;
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number; killed?: boolean };
    const result: PowerShellRunResult = {
      ok: false,
      stdout: (e.stdout || "").toString().trim(),
      stderr: (e.stderr || "").toString().trim(),
      exitCode: e.killed ? -1 : (e.status ?? 1),
      durationMs: Date.now() - start,
    };

    if (opts?.logPath) {
      appendLog(opts.logPath, result);
    }

    return result;
  } finally {
    try {
      const { unlinkSync } = require("fs") as typeof import("fs");
      if (existsSync(scriptPath)) unlinkSync(scriptPath);
    } catch { /* cleanup non-fatal */ }
  }
}

export function runPowerShellCommand(
  command: string,
  opts?: { timeout?: number; cwd?: string; env?: Record<string, string> },
): PowerShellRunResult {
  const start = Date.now();
  try {
    const out = execSync(
      `powershell -ExecutionPolicy Bypass -NoProfile -Command "${command.replace(/"/g, '\\"')}"`,
      {
        encoding: "utf-8",
        timeout: opts?.timeout || 30000,
        cwd: opts?.cwd,
        env: { ...process.env, ...opts?.env } as Record<string, string>,
      },
    );
    return { ok: true, stdout: out.trim(), stderr: "", exitCode: 0, durationMs: Date.now() - start };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number; killed?: boolean };
    return {
      ok: false,
      stdout: (e.stdout || "").toString().trim(),
      stderr: (e.stderr || "").toString().trim(),
      exitCode: e.killed ? -1 : (e.status ?? 1),
      durationMs: Date.now() - start,
    };
  }
}

export function spawnPowerShellScript(
  scriptContent: string,
  opts?: { cwd?: string; env?: Record<string, string> },
): ChildProcess {
  const scriptPath = join(tmpdir(), `hermes-ps-spawn-${Date.now()}.ps1`);
  writeFileSync(scriptPath, scriptContent, "utf-8");
  return spawn(
    "powershell",
    ["-ExecutionPolicy", "Bypass", "-NoProfile", "-File", scriptPath],
    {
      cwd: opts?.cwd,
      env: { ...process.env, ...opts?.env } as Record<string, string>,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
}

function appendLog(logPath: string, result: PowerShellRunResult): void {
  try {
    const dir = join(logPath, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const entry = `[${new Date().toISOString()}] exit=${result.exitCode} duration=${result.durationMs}ms\nstdout: ${result.stdout}\nstderr: ${result.stderr}\n---\n`;
    const { appendFileSync } = require("fs") as typeof import("fs");
    appendFileSync(logPath, entry, "utf-8");
  } catch { /* log write non-fatal */ }
}
