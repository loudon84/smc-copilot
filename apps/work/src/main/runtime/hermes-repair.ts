/**
 * Explicit Repair for wrong Hermes origin (A-REPAIR-001).
 * Requires confirm=true. Takes T0 backup then reinstalls from enterprise
 * identity + approvedCommit. MUST NOT silently git remote set-url.
 */
import { spawn } from "child_process";
import { createHash, randomUUID } from "crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { HIDDEN_SUBPROCESS_OPTIONS } from "../process-options";
import {
  BOOTSTRAP_TIMEOUT_MS,
  powershellExe,
  resolveInstallPs1,
  runHermesBootstrap,
} from "./hermes-bootstrap";
import {
  HERMES_REPO_ORIGIN_MISMATCH,
  setBootstrapState,
} from "./hermes-bootstrap-state";
import { loadReleaseSource } from "./hermes-release-source";
import { getHermesRoot } from "./hermes-root";

export interface RepairOriginOptions {
  /** Must be explicitly true — no silent repair. */
  confirm: boolean;
  hermesRoot?: string;
  userDataPath?: string;
}

export interface RepairOriginResult {
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  backupPath?: string;
  backupDigest?: string;
  operationId?: string;
}

function listFilesRecursive(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const abs = join(dir, name);
      const childRel = rel ? `${rel}/${name}` : name;
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(abs, childRel);
      else out.push(childRel.replace(/\\/g, "/"));
    }
  };
  walk(root, "");
  return out.sort();
}

/** PRD §12.4 evidence digest of a directory tree. */
export function digestDirectory(root: string): string {
  const hash = createHash("sha256");
  for (const rel of listFilesRecursive(root)) {
    hash.update(rel, "utf8");
    hash.update("\0");
    try {
      hash.update(readFileSync(join(root, rel)));
    } catch {
      hash.update("");
    }
  }
  return hash.digest("hex");
}

function getUserDataPath(override?: string): string {
  if (override) return override;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require("electron") as typeof import("electron");
    return app.getPath("userData");
  } catch {
    return process.env.HERMES_DESKTOP_USER_DATA_DIR || join(process.cwd(), ".tmp-userdata");
  }
}

/**
 * T0 backup: move checkout aside under userData/hermes-repair-backups/<id>.
 * Does not call `git remote set-url`.
 */
export async function repairHermesOrigin(
  opts: RepairOriginOptions,
): Promise<RepairOriginResult> {
  if (!opts.confirm) {
    return {
      success: false,
      errorCode: "HERMES_REPAIR_CONFIRM_REQUIRED",
      errorMessage:
        "Repair requires explicit confirm=true; refusing silent origin fix",
    };
  }

  const operationId = randomUUID();
  const hermesRoot = opts.hermesRoot ?? getHermesRoot();
  const userData = getUserDataPath(opts.userDataPath);
  const source = loadReleaseSource();
  const installPs1 = resolveInstallPs1();
  if (!installPs1) {
    return {
      success: false,
      errorCode: "HERMES_INSTALLER_MISSING",
      errorMessage: "install.ps1 not found",
      operationId,
    };
  }

  setBootstrapState("INSTALLING", {
    operationId,
    errorCode: null,
    errorMessage: null,
  });

  const checkoutCandidates = [
    join(hermesRoot, "hermes-agent"),
    hermesRoot,
  ];
  const checkout = checkoutCandidates.find((p) =>
    existsSync(join(p, ".git")),
  );

  let backupPath: string | undefined;
  let backupDigest: string | undefined;

  if (checkout) {
    const backupRoot = join(userData, "hermes-repair-backups", operationId);
    mkdirSync(backupRoot, { recursive: true });
    backupPath = join(backupRoot, "checkout");
    // Rename aside — do not set-url in place.
    renameSync(checkout, backupPath);
    backupDigest = digestDirectory(backupPath);
    writeFileSync(
      join(backupRoot, "receipt.json"),
      JSON.stringify(
        {
          operationId,
          reason: HERMES_REPO_ORIGIN_MISMATCH,
          installUrl: source.installUrl,
          approvedCommit: source.approvedCommit,
          backupDigest: `sha256:${backupDigest}`,
          backedUpAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf-8",
    );
  }

  // Reinstall from enterprise identity (full install.ps1 — not set-url).
  const code = await new Promise<number | null>((resolve) => {
    const child = spawn(
      powershellExe(),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        installPs1,
        "-RepoUrl",
        source.installUrl,
        "-Commit",
        source.approvedCommit,
        "-NonInteractive",
        "-HermesHome",
        hermesRoot,
      ],
      { stdio: "ignore", ...HIDDEN_SUBPROCESS_OPTIONS },
    );
    const timer = setTimeout(() => {
      if (child.pid) {
        try {
          spawn("taskkill", ["/T", "/F", "/PID", String(child.pid)], {
            stdio: "ignore",
            ...HIDDEN_SUBPROCESS_OPTIONS,
          });
        } catch {
          /* ignore */
        }
      }
      resolve(null);
    }, BOOTSTRAP_TIMEOUT_MS);
    child.on("close", (c) => {
      clearTimeout(timer);
      resolve(c);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(1);
    });
  });

  if (code !== 0) {
    // Best-effort restore backup on failure
    if (backupPath && checkout && existsSync(backupPath) && !existsSync(checkout)) {
      try {
        renameSync(backupPath, checkout);
      } catch {
        /* leave backup in place */
      }
    }
    setBootstrapState("FAIL", {
      operationId,
      errorCode: "HERMES_REPAIR_FAILED",
      errorMessage: `reinstall exit ${code}`,
    });
    return {
      success: false,
      errorCode: "HERMES_REPAIR_FAILED",
      errorMessage: `reinstall exit ${code}`,
      backupPath,
      backupDigest: backupDigest ? `sha256:${backupDigest}` : undefined,
      operationId,
    };
  }

  // Re-run bootstrap tail (policy + gateway) without re-cloning.
  const boot = await runHermesBootstrap({
    getConnectionMode: () => "local",
    getHermesRoot: () => hermesRoot,
    getUserDataPath: () => userData,
    // Checkout now matches — bootstrap should proceed to READY.
    skipLock: false,
    operationId,
  });

  if (boot.state !== "READY") {
    return {
      success: false,
      errorCode: boot.errorCode ?? "HERMES_REPAIR_FAILED",
      errorMessage: boot.errorMessage,
      backupPath,
      backupDigest: backupDigest ? `sha256:${backupDigest}` : undefined,
      operationId,
    };
  }

  // Cleanup empty backup parent marker only — keep backup tree for audit.
  return {
    success: true,
    backupPath,
    backupDigest: backupDigest ? `sha256:${backupDigest}` : undefined,
    operationId,
  };
}

/** Test helper: remove a backup tree. */
export function removeRepairBackup(path: string): void {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}
