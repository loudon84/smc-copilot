import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import type {
  CopilotServeDeployOptions,
  CopilotServeDeployProgressEvent,
  CopilotServeDeployResult,
} from "../../shared/copilot-serve/copilot-serve-contract";
import { resolveInstallLocation } from "../enterprise/windows/install-location-resolver";
import {
  applyCopilotServeEnvFromDisk,
  getCopilotServePort,
  resolveCopilotServeDeployScript,
  resolveCopilotServeRoot,
} from "./copilot-serve-paths";
import { refreshAllRuntimePathCaches } from "../runtime/refresh-runtime-paths";
import { ensureShims } from "../enterprise/shim-manager";

export type DeployProgressHandler = (event: CopilotServeDeployProgressEvent) => void;

function appendChunk(
  chunks: string[],
  buf: Buffer,
  stream: CopilotServeDeployProgressEvent["stream"],
  onProgress?: DeployProgressHandler,
): void {
  const text = buf.toString();
  chunks.push(text);
  if (!onProgress) return;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) {
      onProgress({ line, stream });
    }
  }
}

export function runCopilotServeDeploy(
  options?: CopilotServeDeployOptions,
  onProgress?: DeployProgressHandler,
): Promise<CopilotServeDeployResult> {
  if (process.platform !== "win32") {
    return Promise.resolve({
      success: false,
      exitCode: null,
      log: "",
      error: "copilot-serve deploy is only supported on Windows",
    });
  }

  const scriptPath = resolveCopilotServeDeployScript();
  if (!scriptPath || !existsSync(scriptPath)) {
    return Promise.resolve({
      success: false,
      exitCode: null,
      log: "",
      error: `deploy script not found: ${scriptPath ?? "(null)"}`,
    });
  }

  const loc = resolveInstallLocation();
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-InstallRoot",
    loc.installDir,
  ];
  if (options?.force) args.push("-Force");
  if (options?.restartDesktop) args.push("-RestartDesktop");

  return new Promise((resolve) => {
    const chunks: string[] = [];
    const child = spawn("powershell.exe", args, { windowsHide: true, env: process.env });

    child.stdout?.on("data", (buf: Buffer) => {
      appendChunk(chunks, buf, "stdout", onProgress);
    });
    child.stderr?.on("data", (buf: Buffer) => {
      appendChunk(chunks, buf, "stderr", onProgress);
    });

    child.on("error", (err) => {
      resolve({
        success: false,
        exitCode: null,
        log: chunks.join(""),
        error: err.message,
      });
    });

    child.on("close", (code) => {
      const log = chunks.join("");
      if (code === 0) {
        const serveRoot =
          resolveCopilotServeRoot() ?? join(loc.runtimeRoot, "serve", "src");
        if (existsSync(join(serveRoot, "pyproject.toml"))) {
          applyCopilotServeEnvFromDisk(serveRoot, getCopilotServePort());
        }
        refreshAllRuntimePathCaches();
        ensureShims();
      }
      resolve({
        success: code === 0,
        exitCode: code,
        log,
        error: code === 0 ? null : `deploy exited with code ${code ?? "unknown"}`,
      });
    });
  });
}
