#!/usr/bin/env node
import { createHash } from "crypto";
import { spawnSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
} from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  atomicWriteJson,
  collectAssertions,
  evidenceContainsSecrets,
  gitMeta,
  runInReleaseWorktree,
  toolVersions,
} from "./lib/remote-expert-evidence.mjs";
import { evaluateG7Prerequisites } from "./lib/remote-expert-g7-prereq.mjs";
import {
  FULL_LIVE_IDS,
  PRERUN_LIVE_IDS,
  buildProviderBlock,
  computeGateTimestamps,
  readDesktopVersion,
  resolveConsumerLock,
} from "./lib/remote-expert-g7-evidence.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(ROOT, "..", "..");
const args = process.argv.slice(2);
const releaseWorktree = args.includes("--release-worktree");
const prerun = args.includes("--prerun");

const LIVE_IDS = prerun ? PRERUN_LIVE_IDS : FULL_LIVE_IDS;
const outPath = join(
  ROOT,
  "test-results",
  prerun ? "remote-expert-g7-prerun.json" : "remote-expert-g7.json",
);
const vitestJsonPath = join(
  ROOT,
  "test-results",
  prerun ? "remote-expert-g7-prerun-vitest.json" : "remote-expert-g7-vitest.json",
);
const casesJsonlPath = join(
  ROOT,
  "test-results",
  prerun ? "remote-expert-g7-prerun-cases.jsonl" : "remote-expert-g7-cases.jsonl",
);
const gateName = prerun ? "G7-PRERUN" : "G7";

if (
  releaseWorktree &&
  process.env.SMC_REMOTE_EXPERT_EVIDENCE_NO_WORKTREE !== "1"
) {
  const result = runInReleaseWorktree({
    repoRoot: REPO,
    runnerRel: "scripts/remote-expert-g7.mjs",
    args: args.filter((a) => a !== "--release-worktree"),
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.status);
}

const meta = gitMeta(REPO);
const prereq = evaluateG7Prerequisites({
  env: process.env,
  dirty: meta.dirty,
});
const lock = resolveConsumerLock(REPO);
const desktopVersion = readDesktopVersion(ROOT);

function writeBlocked(errorCode, reason) {
  const evidence = {
    gate: gateName,
    overall: "BLOCKED",
    errorCode,
    reason,
    productionGate: "unpassed",
    claimAuthorized: false,
    passedAt: null,
    expiresAt: null,
    desktopVersion,
    consumer: {
      repo: meta.repo,
      branch: meta.branch,
      sha: meta.sha,
      dirty: meta.dirty,
    },
    provider: buildProviderBlock(lock, process.env.SMC_REMOTE_EXPERT_G7_AGENT_REF),
    topology: {
      backend: null,
      orgIdHash: null,
      envId: prereq.envId ?? null,
      k8sContext: prereq.k8sContext ?? null,
      k8sNamespace: prereq.k8sNamespace ?? null,
      backendUrlEnv: "SMC_REMOTE_EXPERT_G7_BACKEND_URL",
    },
    cases: Object.fromEntries(LIVE_IDS.map((id) => [id, "BLOCKED"])),
    traceIds: [],
    artifacts: [],
    generatedAt: new Date().toISOString(),
    toolVersions: toolVersions(ROOT),
  };
  const serialized = JSON.stringify(evidence, null, 2);
  if (evidenceContainsSecrets(serialized, [process.env.SMC_REMOTE_EXPERT_G7_TOKEN])) {
    process.stdout.write(
      `${JSON.stringify({
        overall: "FAIL",
        errorCode: "REMOTE_EXPERT_EVIDENCE_SECRET_LEAK",
      }, null, 2)}\n`,
    );
    process.exit(1);
  }
  atomicWriteJson(outPath, evidence);
  process.stdout.write(
    `${JSON.stringify({ overall: "BLOCKED", errorCode, outPath, reason, gate: gateName }, null, 2)}\n`,
  );
  process.exit(1);
}

if (!prereq.ready) {
  writeBlocked(
    prereq.errorCode,
    prereq.errorCode === "G7_ENV_INCOMPLETE"
      ? "Live G7 environment variables are incomplete"
      : prereq.errorCode === "G7_CONSUMER_DIRTY"
        ? "Consumer worktree is dirty"
        : "Target expert is not designated for G7",
  );
}

mkdirSync(dirname(vitestJsonPath), { recursive: true });
try {
  if (existsSync(casesJsonlPath)) unlinkSync(casesJsonlPath);
} catch {
  /* ignore */
}

const runId = `${prerun ? "g7-prerun" : "g7"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const vitestLocal = join(
  ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest",
);
const vitestMjs = join(ROOT, "node_modules", "vitest", "vitest.mjs");
const vitestCmd = existsSync(vitestLocal)
  ? vitestLocal
  : existsSync(vitestMjs)
    ? process.execPath
    : "npx";
const baseVitestArgs = [
  "run",
  "tests/remote-expert/live/g7-golden-consumer.live.test.ts",
  "--reporter=json",
  `--outputFile=${vitestJsonPath}`,
];
if (prerun) {
  baseVitestArgs.push("-t", "A-G7-LIVE-00[123]");
}
const vitestArgs = existsSync(vitestLocal)
  ? baseVitestArgs
  : existsSync(vitestMjs)
    ? [vitestMjs, ...baseVitestArgs]
    : ["vitest", ...baseVitestArgs];

const vitest = spawnSync(vitestCmd, vitestArgs, {
  cwd: ROOT,
  encoding: "utf8",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    SMC_REMOTE_EXPERT_G7_RUN_ID: runId,
    SMC_REMOTE_EXPERT_G7_CASES_JSONL: casesJsonlPath,
  },
});

let report = { testResults: [] };
try {
  report = JSON.parse(readFileSync(vitestJsonPath, "utf8"));
} catch {
  report = { testResults: [] };
}
const assertions = collectAssertions(report);

const caseRows = new Map();
if (existsSync(casesJsonlPath)) {
  for (const line of readFileSync(casesJsonlPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row?.id) caseRows.set(row.id, row);
    } catch {
      /* ignore bad lines */
    }
  }
}

const cases = {};
const byId = {};
const traceIds = [];
let anyFail = false;
let anyBlocked = false;

for (const id of LIVE_IDS) {
  const fromJsonl = caseRows.get(id);
  const fromVitest = assertions.find((a) => a.title.includes(`[${id}]`));
  let status = fromJsonl?.status ?? "BLOCKED";
  if (fromVitest?.status === "FAIL") status = "FAIL";
  if (!fromJsonl && fromVitest?.status === "PASS") status = "PASS";
  if (status === "FAIL") anyFail = true;
  if (status === "BLOCKED" || status === "SKIPPED") anyBlocked = true;
  cases[id] = status;
  byId[id] = {
    status,
    evidence: [
      ...(fromVitest
        ? [{ title: fromVitest.title, file: fromVitest.file, status: fromVitest.status }]
        : []),
      ...(fromJsonl ? [fromJsonl] : []),
    ],
  };
  if (fromJsonl?.traceId) traceIds.push(fromJsonl.traceId);
}

let overall = "PASS";
let errorCode = null;
if (anyFail) {
  overall = "FAIL";
  errorCode = "G7_LIVE_CASE_FAILED";
} else if (anyBlocked || vitest.status !== 0) {
  overall = "BLOCKED";
  errorCode = "G7_LIVE_CASE_FAILED";
}

const orgIdHash = prereq.orgId
  ? `sha256:${createHash("sha256").update(prereq.orgId, "utf8").digest("hex")}`
  : null;
let backendOrigin = null;
try {
  backendOrigin = new URL(prereq.backend).origin;
} catch {
  backendOrigin = "redacted-origin-only";
}

// prerun must never set productionGate=passed (L1 cannot authorize)
const gateFields = prerun
  ? {
      productionGate: "unpassed",
      claimAuthorized: false,
      passedAt: null,
      expiresAt: null,
    }
  : computeGateTimestamps(overall);

const evidence = {
  gate: gateName,
  overall,
  errorCode,
  ...gateFields,
  desktopVersion,
  consumer: {
    repo: meta.repo,
    branch: meta.branch,
    sha: meta.sha,
    dirty: meta.dirty,
  },
  provider: buildProviderBlock(lock, prereq.agentRef),
  topology: {
    backend: backendOrigin,
    orgIdHash,
    envId: prereq.envId ?? null,
    k8sContext: prereq.k8sContext ?? null,
    k8sNamespace: prereq.k8sNamespace ?? null,
    backendUrlEnv: "SMC_REMOTE_EXPERT_G7_BACKEND_URL",
  },
  cases,
  byId,
  traceIds,
  artifacts: [outPath, casesJsonlPath],
  generatedAt: new Date().toISOString(),
  toolVersions: toolVersions(ROOT),
  runId,
  vitestExitCode: vitest.status,
};

const token = process.env.SMC_REMOTE_EXPERT_G7_TOKEN ?? "";
const serialized = JSON.stringify(evidence, null, 2);
if (evidenceContainsSecrets(serialized, [token])) {
  try {
    if (existsSync(outPath)) unlinkSync(outPath);
  } catch {
    /* ignore */
  }
  process.stdout.write(
    `${JSON.stringify({
      overall: "FAIL",
      errorCode: "REMOTE_EXPERT_EVIDENCE_SECRET_LEAK",
    }, null, 2)}\n`,
  );
  process.exit(1);
}

atomicWriteJson(outPath, evidence);
process.stdout.write(
  `${JSON.stringify({
    overall,
    errorCode,
    outPath,
    runId,
    gate: gateName,
    productionGate: evidence.productionGate,
    claimAuthorized: evidence.claimAuthorized,
  }, null, 2)}\n`,
);
if (overall !== "PASS") process.exit(1);
