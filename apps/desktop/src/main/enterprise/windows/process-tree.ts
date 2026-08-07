import { execSync, spawn, type ChildProcess } from "node:child_process";

const isWindows = process.platform === "win32";

export interface ProcessTreeEntry {
  pid: number;
  ppid: number;
  name: string;
  cmd?: string;
}

export function listProcessTree(): ProcessTreeEntry[] {
  if (isWindows) return listProcessTreeWin32();
  return listProcessTreePosix();
}

function listProcessTreeWin32(): ProcessTreeEntry[] {
  try {
    const output = execSync(
      'powershell -Command "Get-Process | Select-Object Id,Name,Path | ConvertTo-Json -Compress"',
      { encoding: "utf-8", timeout: 10000 },
    );
    const entries = JSON.parse(output) as Array<{ Id: number; Name: string; Path?: string }>;
    const list = Array.isArray(entries) ? entries : [entries];
    return list.map((e) => ({
      pid: e.Id,
      ppid: 0,
      name: e.Name,
      cmd: e.Path || undefined,
    }));
  } catch {
    return [];
  }
}

function listProcessTreePosix(): ProcessTreeEntry[] {
  try {
    const output = execSync("ps -eo pid,ppid,comm,args", {
      encoding: "utf-8",
      timeout: 5000,
    });
    const lines = output.trim().split("\n").slice(1);
    return lines.map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        pid: parseInt(parts[0], 10),
        ppid: parseInt(parts[1], 10),
        name: parts[2] || "",
        cmd: parts.slice(3).join(" ") || undefined,
      };
    }).filter((e) => !isNaN(e.pid));
  } catch {
    return [];
  }
}

export function findProcessesByName(name: string): ProcessTreeEntry[] {
  return listProcessTree().filter(
    (p) => p.name.toLowerCase().includes(name.toLowerCase()),
  );
}

export function killProcessTree(pid: number): boolean {
  if (isWindows) {
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

export function runPowerShell(
  script: string,
  opts?: { timeout?: number; cwd?: string },
): { ok: boolean; stdout: string; stderr: string; exitCode: number | null } {
  if (!isWindows) {
    return { ok: false, stdout: "", stderr: "PowerShell only available on Windows", exitCode: 1 };
  }
  try {
    const stdout = execSync(`powershell -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`, {
      encoding: "utf-8",
      timeout: opts?.timeout || 30000,
      cwd: opts?.cwd,
    });
    return { ok: true, stdout: stdout.trim(), stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      ok: false,
      stdout: (e.stdout || "").toString().trim(),
      stderr: (e.stderr || "").toString().trim(),
      exitCode: e.status ?? 1,
    };
  }
}

export function spawnPowerShell(script: string, opts?: { cwd?: string }): ChildProcess {
  return spawn(
    "powershell",
    ["-ExecutionPolicy", "Bypass", "-Command", script],
    {
      cwd: opts?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
}
