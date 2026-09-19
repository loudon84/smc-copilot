/**
 * Hermes Native Bootstrap orchestrator (PRD REQ-INSTALL-001 / C-007).
 *
 * Sequence (local only):
 * PRECHECK → ENSURE_GIT → ls-remote → install(if absent) →
 * official-source.json → SMC policy → gateway install/start →
 * health + supportsHermesRunsTransport.
 *
 * Mutex: userData/hermes-bootstrap.lock (see hermes-bootstrap-lock.ts).
 */
import { spawn, type ChildProcess } from "child_process";
import { createHash, randomUUID } from "crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";
import { getApiServerKey, getConnectionConfig } from "../config";
import { HIDDEN_SUBPROCESS_OPTIONS } from "../process-options";
import { supportsHermesRunsTransport } from "../run-stream";
import { withBootstrapLock } from "./hermes-bootstrap-lock";
import {
  HERMES_REPO_ORIGIN_MISMATCH,
  setBootstrapState,
  type HermesBootstrapState,
} from "./hermes-bootstrap-state";
import { writeOfficialSourceJson } from "./hermes-official-source";
import { applySmcPolicy } from "./hermes-policy-apply";
import {
  loadReleaseSource,
  redactForLog,
  type HermesReleaseSource,
} from "./hermes-release-source";
import { getHermesRoot } from "./hermes-root";
import { runHermesCliSync } from "./hermes-cli-runner";
import { probeGatewayHealth } from "./gateway-probe";
import { getGatewayBaseUrl } from "./hermes-runtime-config";
import { ensureProfileGatewayStarted } from "./hermes-named-gateway";

export const BOOTSTRAP_TIMEOUT_MS = 1_800_000;

export interface BootstrapSpawnCall {
  kind: "powershell" | "git";
  args: string[];
  cwd?: string;
}

export interface BootstrapRunResult {
  state: HermesBootstrapState;
  operationId: string;
  skipped?: boolean;
  errorCode?: string;
  errorMessage?: string;
  logPath?: string;
}

export interface HermesBootstrapDeps {
  getConnectionMode: () => "local" | "remote" | "ssh";
  getHermesRoot: () => string;
  getUserDataPath: () => string;
  resolveInstallPs1: () => string | null;
  loadReleaseSource: () => HermesReleaseSource;
  existsSync: (path: string) => boolean;
  spawnPowerShell: (
    scriptArgs: string[],
    opts: { timeoutMs: number; log: (line: string) => void },
  ) => Promise<{ code: number | null }>;
  runGit: (
    gitExe: string,
    args: string[],
    opts: { timeoutMs: number; log: (line: string) => void },
  ) => Promise<{ code: number | null; stdout: string; stderr: string }>;
  readOriginUrl: (checkoutDir: string, gitExe: string) => Promise<string | null>;
  applyPolicy: (opts: {
    hermesRoot: string;
    policyVersion: string;
  }) => void;
  writeOfficialSource: (
    hermesRoot: string,
    source: HermesReleaseSource,
  ) => void;
  installAndStartGateway: () => Promise<boolean>;
  probeHealth: () => Promise<boolean>;
  fetchCapabilities: () => Promise<unknown>;
  onSpawnCall?: (call: BootstrapSpawnCall) => void;
  timeoutMs?: number;
  operationId?: string;
  /** When true, skip lock (unit tests that inject their own sequencing). */
  skipLock?: boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  killProcessTree?: (pid: number) => void;
}

let activeBootstrap: {
  operationId: string;
  cancel: () => void;
} | null = null;

function windowsUsername(): string {
  return (
    process.env.USERNAME ||
    process.env.USER ||
    homedir().split(/[/\\]/).pop() ||
    "user"
  );
}

export function powershellExe(): string {
  const root = process.env.SystemRoot || "C:\\Windows";
  return join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

export function candidateInstallPs1Paths(): string[] {
  const out: string[] = [];
  if (process.env.HERMES_INSTALL_PS1?.trim()) {
    out.push(process.env.HERMES_INSTALL_PS1.trim());
  }
  const resourcesPath = (
    process as NodeJS.Process & { resourcesPath?: string }
  ).resourcesPath;
  if (resourcesPath) {
    out.push(join(resourcesPath, "hermes-bootstrap", "install.ps1"));
  }
  try {
    // Lazy require to keep unit tests free of electron when unused.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require("electron") as typeof import("electron");
    if (app?.getAppPath) {
      out.push(
        join(app.getAppPath(), "resources", "hermes-bootstrap", "install.ps1"),
      );
    }
  } catch {
    /* not in electron */
  }
  out.push(
    join(__dirname, "../../../resources/hermes-bootstrap/install.ps1"),
  );
  out.push(join(process.cwd(), "resources/hermes-bootstrap/install.ps1"));
  // Dev fallback: local enterprise fork working copy.
  out.push("e:/git/hermes-agent/scripts/install.ps1");
  out.push("E:\\git\\hermes-agent\\scripts\\install.ps1");
  return out;
}

export function resolveInstallPs1(): string | null {
  for (const p of candidateInstallPs1Paths()) {
    if (existsSync(p)) return p;
  }
  return null;
}

function portableGitExe(hermesRoot: string): string {
  return join(hermesRoot, "git", "cmd", "git.exe");
}

function checkoutDir(hermesRoot: string): string {
  // Enterprise fork layout: checkout lives under Hermes Root as hermes-agent.
  const primary = join(hermesRoot, "hermes-agent");
  if (existsSync(join(primary, ".git"))) return primary;
  // Some installs use Root itself as the checkout.
  if (existsSync(join(hermesRoot, ".git"))) return hermesRoot;
  return primary;
}

function normalizeOrigin(url: string): string {
  return url
    .trim()
    .replace(/\/\/[^/@]+@/, "//")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .toLowerCase();
}

function originsMatch(a: string, b: string): boolean {
  return normalizeOrigin(a) === normalizeOrigin(b);
}

function getUserDataPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require("electron") as typeof import("electron");
    return app.getPath("userData");
  } catch {
    return (
      process.env.HERMES_DESKTOP_USER_DATA_DIR ||
      join(homedir(), ".smc-copilot-work")
    );
  }
}

function killWindowsProcessTree(pid: number): void {
  try {
    spawn("taskkill", ["/T", "/F", "/PID", String(pid)], {
      stdio: "ignore",
      ...HIDDEN_SUBPROCESS_OPTIONS,
    });
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* ignore */
    }
  }
}

async function defaultSpawnPowerShell(
  scriptArgs: string[],
  opts: {
    timeoutMs: number;
    log: (line: string) => void;
    onPid?: (pid: number) => void;
    killProcessTree?: (pid: number) => void;
  },
): Promise<{ code: number | null }> {
  const exe = powershellExe();
  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    ...scriptArgs,
  ];
  opts.log(`spawn ${exe} ${args.map(redactForLog).join(" ")}`);

  return new Promise((resolve) => {
    const child: ChildProcess = spawn(exe, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...HIDDEN_SUBPROCESS_OPTIONS,
    });
    if (child.pid) opts.onPid?.(child.pid);

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      opts.log(`TIMEOUT after ${opts.timeoutMs}ms — killing process tree`);
      if (child.pid) {
        (opts.killProcessTree ?? killWindowsProcessTree)(child.pid);
      }
      resolve({ code: null });
    }, opts.timeoutMs);

    const onData = (buf: Buffer): void => {
      for (const line of buf.toString("utf-8").split(/\r?\n/)) {
        if (line.trim()) opts.log(redactForLog(line));
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.log(`spawn error: ${err.message}`);
      resolve({ code: 1 });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code });
    });
  });
}

async function defaultRunGit(
  gitExe: string,
  args: string[],
  opts: { timeoutMs: number; log: (line: string) => void },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  opts.log(`git ${args.map(redactForLog).join(" ")}`);
  return new Promise((resolve) => {
    const child = spawn(gitExe, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
      ...HIDDEN_SUBPROCESS_OPTIONS,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (child.pid) killWindowsProcessTree(child.pid);
      resolve({ code: null, stdout, stderr });
    }, opts.timeoutMs);
    child.stdout?.on("data", (b: Buffer) => {
      stdout += b.toString("utf-8");
    });
    child.stderr?.on("data", (b: Buffer) => {
      stderr += b.toString("utf-8");
      opts.log(redactForLog(b.toString("utf-8")));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr });
    });
  });
}

async function defaultReadOrigin(
  checkout: string,
  gitExe: string,
): Promise<string | null> {
  if (!existsSync(join(checkout, ".git"))) return null;
  const result = await defaultRunGit(
    gitExe,
    ["-C", checkout, "remote", "get-url", "origin"],
    { timeoutMs: 30_000, log: () => {} },
  );
  if (result.code !== 0) return null;
  return result.stdout.trim() || null;
}

async function defaultFetchCapabilities(): Promise<unknown> {
  const base = getGatewayBaseUrl().replace(/\/+$/, "");
  try {
    const headers: Record<string, string> = {};
    const apiKey = getApiServerKey()?.trim();
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const res = await fetch(`${base}/v1/capabilities`, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function createLogger(
  userData: string,
  operationId: string,
): { logPath: string; log: (line: string) => void } {
  const dir = join(userData, "logs");
  mkdirSync(dir, { recursive: true });
  const logPath = join(dir, `hermes-bootstrap-${operationId}.log`);
  writeFileSync(logPath, "", "utf-8");
  return {
    logPath,
    log: (line: string) => {
      const stamped = `[${new Date().toISOString()}] ${redactForLog(line)}\n`;
      try {
        appendFileSync(logPath, stamped, "utf-8");
      } catch {
        /* ignore */
      }
    },
  };
}

function createDefaultDeps(): HermesBootstrapDeps {
  let currentChildPid: number | null = null;
  return {
    getConnectionMode: () => getConnectionConfig().mode,
    getHermesRoot,
    getUserDataPath,
    resolveInstallPs1,
    loadReleaseSource: () => loadReleaseSource(),
    existsSync,
    spawnPowerShell: (scriptArgs, opts) =>
      defaultSpawnPowerShell(scriptArgs, {
        ...opts,
        onPid: (pid) => {
          currentChildPid = pid;
        },
        killProcessTree: (pid) => {
          killWindowsProcessTree(pid);
          currentChildPid = null;
        },
      }),
    runGit: defaultRunGit,
    readOriginUrl: defaultReadOrigin,
    applyPolicy: ({ hermesRoot, policyVersion }) => {
      applySmcPolicy({ hermesRoot, policyVersion });
    },
    writeOfficialSource: writeOfficialSourceJson,
    installAndStartGateway: () => ensureProfileGatewayStarted(),
    probeHealth: () => probeGatewayHealth(getGatewayBaseUrl()),
    fetchCapabilities: defaultFetchCapabilities,
    killProcessTree: (pid) => {
      killWindowsProcessTree(pid);
      if (currentChildPid === pid) currentChildPid = null;
    },
  };
}

async function runBootstrapBody(
  deps: HermesBootstrapDeps,
  operationId: string,
  log: (line: string) => void,
): Promise<BootstrapRunResult> {
  const timeoutMs = deps.timeoutMs ?? BOOTSTRAP_TIMEOUT_MS;
  const installPs1 = deps.resolveInstallPs1();
  if (!installPs1) {
    setBootstrapState("FAIL", {
      operationId,
      errorCode: "HERMES_INSTALLER_MISSING",
      errorMessage: "bundled install.ps1 not found",
    });
    return {
      state: "FAIL",
      operationId,
      errorCode: "HERMES_INSTALLER_MISSING",
      errorMessage: "bundled install.ps1 not found",
    };
  }

  let source: HermesReleaseSource;
  try {
    source = deps.loadReleaseSource();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setBootstrapState("FAIL", {
      operationId,
      errorCode: "RELEASE_CONFIG_INVALID",
      errorMessage: msg,
    });
    return {
      state: "FAIL",
      operationId,
      errorCode: "RELEASE_CONFIG_INVALID",
      errorMessage: msg,
    };
  }

  log(`PRECHECK installUrl=${redactForLog(source.installUrl)} commit=${source.approvedCommit}`);
  const hermesRoot = deps.getHermesRoot();
  mkdirSync(hermesRoot, { recursive: true });

  // ENSURE_GIT
  deps.onSpawnCall?.({
    kind: "powershell",
    args: [installPs1, "-Stage", "git", "-NonInteractive", "-HermesHome", hermesRoot],
  });
  log("ENSURE_GIT: install.ps1 -Stage git");
  const gitStage = await deps.spawnPowerShell(
    [
      installPs1,
      "-Stage",
      "git",
      "-NonInteractive",
      "-HermesHome",
      hermesRoot,
    ],
    { timeoutMs, log },
  );
  if (gitStage.code === null) {
    setBootstrapState("FAIL", {
      operationId,
      errorCode: "HERMES_BOOTSTRAP_TIMEOUT",
      errorMessage: "ENSURE_GIT timed out",
    });
    return {
      state: "FAIL",
      operationId,
      errorCode: "HERMES_BOOTSTRAP_TIMEOUT",
      errorMessage: "ENSURE_GIT timed out",
    };
  }
  if (gitStage.code !== 0) {
    setBootstrapState("FAIL", {
      operationId,
      errorCode: "HERMES_ENSURE_GIT_FAILED",
      errorMessage: `ENSURE_GIT exit ${gitStage.code}`,
    });
    return {
      state: "FAIL",
      operationId,
      errorCode: "HERMES_ENSURE_GIT_FAILED",
      errorMessage: `ENSURE_GIT exit ${gitStage.code}`,
    };
  }

  const gitExe = deps.existsSync(portableGitExe(hermesRoot))
    ? portableGitExe(hermesRoot)
    : "git";

  // ls-remote AFTER ENSURE_GIT (A-INSTALL-004)
  deps.onSpawnCall?.({
    kind: "git",
    args: ["ls-remote", source.installUrl, "HEAD"],
  });
  log(`ENTERPRISE_REPO_AUTH_CHECK: ls-remote via ${gitExe}`);
  const ls = await deps.runGit(
    gitExe,
    ["ls-remote", source.installUrl, "HEAD"],
    { timeoutMs: Math.min(120_000, timeoutMs), log },
  );
  if (ls.code !== 0) {
    setBootstrapState("FAIL", {
      operationId,
      errorCode: "HERMES_REPO_UNREACHABLE",
      errorMessage: "ls-remote failed against enterprise installUrl",
    });
    return {
      state: "FAIL",
      operationId,
      errorCode: "HERMES_REPO_UNREACHABLE",
      errorMessage: "ls-remote failed against enterprise installUrl",
    };
  }

  const checkout = checkoutDir(hermesRoot);
  const checkoutExists = deps.existsSync(join(checkout, ".git"));

  if (checkoutExists) {
    const origin = await deps.readOriginUrl(checkout, gitExe);
    if (origin && !originsMatch(origin, source.installUrl)) {
      log(
        `REPO_MISMATCH origin=${redactForLog(origin)} expected=${redactForLog(source.installUrl)}`,
      );
      setBootstrapState("REPO_MISMATCH", {
        operationId,
        errorCode: HERMES_REPO_ORIGIN_MISMATCH,
        errorMessage:
          "Checkout origin does not match enterprise installUrl; use explicit Repair",
      });
      return {
        state: "REPO_MISMATCH",
        operationId,
        errorCode: HERMES_REPO_ORIGIN_MISMATCH,
        errorMessage:
          "Checkout origin does not match enterprise installUrl; use explicit Repair",
      };
    }
  } else {
    deps.onSpawnCall?.({
      kind: "powershell",
      args: [
        installPs1,
        "-RepoUrl",
        source.installUrl,
        "-Commit",
        source.approvedCommit,
        "-NonInteractive",
        "-HermesHome",
        hermesRoot,
      ],
    });
    log("NATIVE_INSTALL: full install.ps1");
    const install = await deps.spawnPowerShell(
      [
        installPs1,
        "-RepoUrl",
        source.installUrl,
        "-Commit",
        source.approvedCommit,
        "-NonInteractive",
        "-HermesHome",
        hermesRoot,
      ],
      { timeoutMs, log },
    );
    if (install.code === null) {
      setBootstrapState("FAIL", {
        operationId,
        errorCode: "HERMES_BOOTSTRAP_TIMEOUT",
        errorMessage: "Native install timed out",
      });
      return {
        state: "FAIL",
        operationId,
        errorCode: "HERMES_BOOTSTRAP_TIMEOUT",
        errorMessage: "Native install timed out",
      };
    }
    if (install.code !== 0) {
      setBootstrapState("FAIL", {
        operationId,
        errorCode: "HERMES_NATIVE_INSTALL_FAILED",
        errorMessage: `install.ps1 exit ${install.code}`,
      });
      return {
        state: "FAIL",
        operationId,
        errorCode: "HERMES_NATIVE_INSTALL_FAILED",
        errorMessage: `install.ps1 exit ${install.code}`,
      };
    }
  }

  deps.writeOfficialSource(hermesRoot, source);
  log("Wrote official-source.json");

  deps.applyPolicy({
    hermesRoot,
    policyVersion: source.policyVersion,
  });
  log(`Applied policy ${source.policyVersion}`);

  const gatewayOk = await deps.installAndStartGateway();
  if (!gatewayOk) {
    // Try one more health probe
    const healthy = await deps.probeHealth();
    if (!healthy) {
      setBootstrapState("FAIL", {
        operationId,
        errorCode: "HERMES_GATEWAY_UNHEALTHY",
        errorMessage: "Gateway health not 200 after install/start",
      });
      return {
        state: "FAIL",
        operationId,
        errorCode: "HERMES_GATEWAY_UNHEALTHY",
        errorMessage: "Gateway health not 200 after install/start",
      };
    }
  }

  const caps = await deps.fetchCapabilities();
  if (!supportsHermesRunsTransport(caps as never)) {
    log("CAPABILITY_CHECK: supportsHermesRunsTransport=false → not READY");
    setBootstrapState("FAIL", {
      operationId,
      errorCode: "MISSING_REQUIRED_CAPABILITY",
      errorMessage:
        "Gateway health ok but Work required capabilities missing (supportsHermesRunsTransport)",
    });
    return {
      state: "FAIL",
      operationId,
      errorCode: "MISSING_REQUIRED_CAPABILITY",
      errorMessage:
        "Gateway health ok but Work required capabilities missing (supportsHermesRunsTransport)",
    };
  }

  // Receipt digest (no credentials)
  const receipt = createHash("sha256")
    .update(
      `${source.repositoryIdentity}|${source.approvedCommit}|${operationId}`,
      "utf8",
    )
    .digest("hex");
  log(`RECEIPT sha256:${receipt}`);

  setBootstrapState("READY", { operationId });
  return { state: "READY", operationId };
}

/**
 * Kick off bootstrap. remote/ssh → no-op, zero mutation (A-INSTALL-006).
 */
export async function runHermesBootstrap(
  overrideDeps?: Partial<HermesBootstrapDeps>,
): Promise<BootstrapRunResult> {
  const deps: HermesBootstrapDeps = {
    ...createDefaultDeps(),
    ...overrideDeps,
  };
  const mode = deps.getConnectionMode();
  const operationId = deps.operationId ?? randomUUID();

  if (mode === "remote" || mode === "ssh") {
    setBootstrapState("READY", {
      operationId,
      skippedReason: `connectionMode=${mode}`,
    });
    return {
      state: "READY",
      operationId,
      skipped: true,
    };
  }

  setBootstrapState("INSTALLING", { operationId });
  const userData = deps.getUserDataPath();
  const { logPath, log } = createLogger(userData, operationId);
  log(
    `Bootstrap start user=${windowsUsername()} mutex=Local\\SMC-Work-HermesBootstrap-<user> via lockfile`,
  );

  const cancelRef = { cancelled: false };
  activeBootstrap = {
    operationId,
    cancel: () => {
      cancelRef.cancelled = true;
    },
  };

  const run = async (): Promise<BootstrapRunResult> => {
    try {
      if (cancelRef.cancelled) {
        setBootstrapState("FAIL", {
          operationId,
          errorCode: "HERMES_BOOTSTRAP_CANCELLED",
          errorMessage: "cancelled",
        });
        return {
          state: "FAIL",
          operationId,
          errorCode: "HERMES_BOOTSTRAP_CANCELLED",
          logPath,
        };
      }
      const result = await runBootstrapBody(deps, operationId, log);
      return { ...result, logPath };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`FAIL: ${msg}`);
      setBootstrapState("FAIL", {
        operationId,
        errorCode: "HERMES_BOOTSTRAP_FAILED",
        errorMessage: msg,
      });
      return {
        state: "FAIL",
        operationId,
        errorCode: "HERMES_BOOTSTRAP_FAILED",
        errorMessage: msg,
        logPath,
      };
    } finally {
      if (activeBootstrap?.operationId === operationId) {
        activeBootstrap = null;
      }
    }
  };

  if (deps.skipLock) {
    return run();
  }

  try {
    return await withBootstrapLock(
      {
        userDataPath: userData,
        operationId,
        waitMs: deps.timeoutMs ?? BOOTSTRAP_TIMEOUT_MS,
        sleep: deps.sleep,
        now: deps.now,
      },
      run,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setBootstrapState("FAIL", {
      operationId,
      errorCode: "HERMES_BOOTSTRAP_LOCK_TIMEOUT",
      errorMessage: msg,
    });
    return {
      state: "FAIL",
      operationId,
      errorCode: "HERMES_BOOTSTRAP_LOCK_TIMEOUT",
      errorMessage: msg,
      logPath,
    };
  }
}

export function cancelHermesBootstrap(): boolean {
  if (!activeBootstrap) return false;
  activeBootstrap.cancel();
  try {
    runHermesCliSync(["gateway", "status"], 5_000);
  } catch {
    /* ignore */
  }
  setBootstrapState("FAIL", {
    operationId: activeBootstrap.operationId,
    errorCode: "HERMES_BOOTSTRAP_CANCELLED",
    errorMessage: "cancelled by user",
  });
  activeBootstrap = null;
  return true;
}

/** Fire-and-forget from app/start.ts after window ready. */
export function startHermesBootstrapAsync(): void {
  void runHermesBootstrap().catch((err) => {
    console.error("[hermes-bootstrap]", err);
  });
}
