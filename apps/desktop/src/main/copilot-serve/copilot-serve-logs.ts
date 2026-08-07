import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { dirname } from "path";
import { getCopilotServePaths } from "./copilot-serve-paths";

export function readCopilotServeLogs(options?: { tailLines?: number }): string {
  const paths = getCopilotServePaths();
  if (!paths || !existsSync(paths.logPath)) {
    return "";
  }

  const raw = readFileSync(paths.logPath, "utf-8");
  const tailLines = options?.tailLines ?? 200;
  const lines = raw.split(/\r?\n/);
  if (lines.length <= tailLines) {
    return raw;
  }
  return lines.slice(-tailLines).join("\n");
}

export function appendCopilotServeLog(line: string): void {
  const paths = getCopilotServePaths();
  if (!paths) return;
  mkdirSync(dirname(paths.logPath), { recursive: true });
  appendFileSync(paths.logPath, `${line}\n`, "utf-8");
}
