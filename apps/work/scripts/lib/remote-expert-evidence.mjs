import { execSync, spawnSync } from "child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export const ACCEPTANCE_ID_RE = /\[(A-(?:[A-Z0-9]+-)+\d{3})\]/g;

export const SECRET_RE =
  /(?:authorization\s*:\s*bearer\s+\S+|Bearer\s+\S+|access_token|refresh_token|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|execution_capability|internal_token)/gi;

export function gitMeta(cwd) {
  try {
    const sha = execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf8",
    }).trim();
    const dirty = execSync("git status --porcelain", {
      cwd,
      encoding: "utf8",
    }).trim();
    let remote = "";
    try {
      remote = execSync("git remote get-url origin", {
        cwd,
        encoding: "utf8",
      }).trim();
    } catch {
      remote = "";
    }
    const repo = remote.includes("smc-copilot")
      ? "loudon84/smc-copilot"
      : remote || "loudon84/smc-copilot";
    return { repo, branch, sha, dirty: dirty.length > 0 };
  } catch {
    return { repo: null, branch: null, sha: null, dirty: true };
  }
}

export function toolVersions(cwd) {
  const run = (cmd) => {
    try {
      return execSync(cmd, { cwd, encoding: "utf8" }).trim().split("\n")[0];
    } catch {
      return null;
    }
  };
  return {
    node: run("node -v"),
    npm: run("npm -v"),
    vitest: run("npx vitest --version"),
  };
}

export function collectAssertions(report) {
  const rows = [];
  for (const file of report?.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      const title = String(assertion.fullName ?? assertion.title ?? "");
      rows.push({
        title,
        status: assertion.status === "passed" ? "PASS" : "FAIL",
        file: file.name,
      });
    }
  }
  return rows;
}

export function mapAcceptanceById(assertions, requiredIds) {
  const byId = Object.fromEntries(
    requiredIds.map((id) => [id, { status: "UNCOVERED", evidence: [] }]),
  );
  for (const assertion of assertions) {
    const ids = [...assertion.title.matchAll(ACCEPTANCE_ID_RE)].map((m) => m[1]);
    for (const id of ids) {
      const current = byId[id];
      if (!current) continue;
      current.evidence.push({
        title: assertion.title,
        file: assertion.file,
        status: assertion.status,
      });
      if (assertion.status === "FAIL") current.status = "FAIL";
      else if (current.status === "UNCOVERED") current.status = "PASS";
    }
  }
  return byId;
}

export function evaluateG6({ commands, assertions, required, dirty }) {
  const byId = mapAcceptanceById(assertions, required);
  const cases = Object.fromEntries(
    required.map((id) => [id, byId[id].status]),
  );
  const commandFailed = (commands ?? []).some((c) => (c.exitCode ?? 1) !== 0);
  const failed = Object.values(cases).some((s) => s === "FAIL") || commandFailed;
  const uncovered = Object.values(cases).some((s) => s === "UNCOVERED");
  const skipped = Object.values(cases).some((s) => s === "SKIPPED");
  const blockedCase = Object.values(cases).some((s) => s === "BLOCKED");

  let overall = "PASS";
  let errorCode = null;
  if (dirty) {
    overall = "BLOCKED";
    errorCode = "G6_CONSUMER_DIRTY";
  } else if (uncovered) {
    overall = "FAIL";
    errorCode = "G6_REQUIRED_ACCEPTANCE_UNCOVERED";
  } else if (failed || skipped || blockedCase) {
    overall = "FAIL";
    errorCode = "G6_REQUIRED_ACCEPTANCE_FAILED";
  }
  return { overall, errorCode, cases, byId };
}

export function evidenceContainsSecrets(text, extraSecrets = []) {
  SECRET_RE.lastIndex = 0;
  if (SECRET_RE.test(text)) return true;
  for (const secret of extraSecrets) {
    if (secret && text.includes(secret)) return true;
  }
  return false;
}

export function atomicWriteJson(outPath, value) {
  mkdirSync(dirname(outPath), { recursive: true });
  const tmp = `${outPath}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tmp, outPath);
}

export function verifyEvidenceSha(evidencePath, expectedSha) {
  const raw = readFileSync(evidencePath, "utf8");
  const evidence = JSON.parse(raw);
  const sha = evidence.commitSha ?? evidence.consumer?.sha ?? null;
  if (sha !== expectedSha) {
    return { ok: false, errorCode: "G6_EVIDENCE_STALE", sha };
  }
  return { ok: true, sha };
}

export function runInReleaseWorktree({
  repoRoot,
  workPackageRel = "apps/work",
  runnerRel,
  args = [],
}) {
  const worktreeRoot = mkdtempSync(join(tmpdir(), "remote-expert-g6-"));
  try {
    execSync(`git worktree add --detach "${worktreeRoot}" HEAD`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "pipe",
    });
    const linkNodeModules = (from, to) => {
      if (!existsSync(from)) return;
      try {
        symlinkSync(from, to, "junction");
      } catch {
        try {
          symlinkSync(from, to, "dir");
        } catch (err) {
          throw new Error(
            `G6_WORKTREE_LINK_FAILED: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    };
    linkNodeModules(
      join(repoRoot, "node_modules"),
      join(worktreeRoot, "node_modules"),
    );
    linkNodeModules(
      join(repoRoot, workPackageRel, "node_modules"),
      join(worktreeRoot, workPackageRel, "node_modules"),
    );
    const workCwd = join(worktreeRoot, workPackageRel);
    const result = spawnSync(process.execPath, [runnerRel, ...args], {
      cwd: workCwd,
      encoding: "utf8",
      env: { ...process.env, SMC_REMOTE_EXPERT_EVIDENCE_NO_WORKTREE: "1" },
    });
    const srcEvidence = join(workCwd, "test-results");
    const dstEvidence = join(repoRoot, workPackageRel, "test-results");
    mkdirSync(dstEvidence, { recursive: true });
    if (existsSync(srcEvidence)) {
      for (const name of ["remote-expert-g6.json", "remote-expert-g7.json"]) {
        const from = join(srcEvidence, name);
        if (existsSync(from)) copyFileSync(from, join(dstEvidence, name));
      }
    }
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      worktreeRoot,
    };
  } finally {
    try {
      execSync(`git worktree remove --force "${worktreeRoot}"`, {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch {
      try {
        rmSync(worktreeRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

export function packageRootFromMeta(importMetaUrl) {
  return join(dirname(fileURLToPath(importMetaUrl)), "..");
}
