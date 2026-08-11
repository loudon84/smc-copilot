/**
 * Ensure the local Hermes dashboard web UI dist exists before spawning
 * `hermes dashboard --skip-build`. Mirrors [[ssh-remote.ts#sshEnsureDashboardDist]]
 * for the local install: incomplete `node_modules` or a missing dist makes the
 * in-process build exceed chat's readiness window and force API fallback.
 */
// @lat: [[main-process#Local dashboard web dist]]
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import {
  getEnhancedPath,
  HERMES_REPO,
} from "./runtime/hermes-runtime-paths";
import { HIDDEN_SUBPROCESS_OPTIONS } from "./process-options";

const WEB_DIST_INDEX = (): string =>
  join(HERMES_REPO, "hermes_cli", "web_dist", "index.html");

/** Path to the Vite-built dashboard SPA served by `hermes dashboard`. */
export function localDashboardWebDistDir(): string {
  return join(HERMES_REPO, "hermes_cli", "web_dist");
}

export function hasLocalDashboardWebDist(): boolean {
  return existsSync(WEB_DIST_INDEX());
}

let inflight: Promise<boolean> | null = null;

function runNpm(
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const chunks: Buffer[] = [];
    const proc = spawn(npmCmd, args, {
      cwd,
      env: {
        ...process.env,
        PATH: getEnhancedPath(),
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      ...HIDDEN_SUBPROCESS_OPTIONS,
    });

    const timer = setTimeout(() => {
      try {
        proc.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      resolve({
        code: null,
        output: Buffer.concat(chunks).toString("utf-8") + "\n[timed out]",
      });
    }, timeoutMs);
    timer.unref?.();

    proc.stdout?.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr?.on("data", (c: Buffer) => chunks.push(c));
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 1, output: err.message });
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolve({
        code,
        output: Buffer.concat(chunks).toString("utf-8"),
      });
    });
  });
}

/**
 * Returns true when `hermes_cli/web_dist/index.html` exists (already or after
 * `npm install --workspace web` + `npm run build -w web`). Concurrent callers
 * share one in-flight build.
 */
export async function ensureLocalDashboardWebDist(): Promise<boolean> {
  if (hasLocalDashboardWebDist()) return true;
  if (!existsSync(join(HERMES_REPO, "web", "package.json"))) return false;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      console.log("[dashboard-web-dist] installing web workspace deps...");
      const install = await runNpm(
        ["install", "--workspace", "web", "--no-fund", "--no-audit"],
        HERMES_REPO,
        300_000,
      );
      if (install.code !== 0) {
        console.warn(
          "[dashboard-web-dist] npm install failed:",
          install.output.trim().split(/\r?\n/).slice(-15).join("\n"),
        );
        return hasLocalDashboardWebDist();
      }

      console.log("[dashboard-web-dist] building web UI...");
      const build = await runNpm(["run", "build", "-w", "web"], HERMES_REPO, 300_000);
      if (build.code !== 0) {
        console.warn(
          "[dashboard-web-dist] npm build failed:",
          build.output.trim().split(/\r?\n/).slice(-15).join("\n"),
        );
      }
      return hasLocalDashboardWebDist();
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
