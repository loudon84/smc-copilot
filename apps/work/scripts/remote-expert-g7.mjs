#!/usr/bin/env node
import { createHash } from "crypto";
import { spawnSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(ROOT, "..", "..");
const outPath = join(ROOT, "test-results", "remote-expert-g7.json");
const vitestJsonPath = join(ROOT, "test-results", "remote-expert-g7-vitest.json");
const casesJsonlPath = join(ROOT, "test-results", "remote-expert-g7-cases.jsonl");

const LIVE_IDS = Array.from({ length: 15 }, (_, i) =>
  `A-G7-LIVE-${String(i + 1).padStart(3, "0")}`,
);

const args = process.argv.slice(2);
const releaseWorktree = args.includes("--release-worktree");

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

function writeBlocked(errorCode, reason) {
  const evidence = {
    gate: "G7",
    overall: "BLOCKED",
    errorCode,
    reason,
    consumer: {
      repo: meta.repo,
      branch: meta.branch,
      sha: meta.sha,
      dirty: meta.dirty,
    },
    provider: {
      frontendContractVersion: "2.0.0",
      frontendContractDigest: null,
      agentRef: process.env.SMC_REMOTE_EXPERT_G7_AGENT_REF ?? null,
    },
    topology: {
      backend: null,
      orgIdHash: null,
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
    `${JSON.stringify({ overall: "BLOCKED", errorCode, outPath, reason }, null, 2)}\n`,
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

const runId = `g7-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
const vitestArgs = existsSync(vitestLocal)
  ? [
      "run",
      "tests/remote-expert/live/g7-golden-consumer.live.test.ts",
      "--reporter=json",
      `--outputFile=${vitestJsonPath}`,
    ]
  : existsSync(vitestMjs)
    ? [
        vitestMjs,
        "run",
        "tests/remote-expert/live/g7-golden-consumer.live.test.ts",
        "--reporter=json",
        `--outputFile=${vitestJsonPath}`,
      ]
    : [
        "vitest",
        "run",
        "tests/remote-expert/live/g7-golden-consumer.live.test.ts",
        "--reporter=json",
        `--outputFile=${vitestJsonPath}`,
      ];
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

const evidence = {
  gate: "G7",
  overall,
  errorCode,
  consumer: {
    repo: meta.repo,
    branch: meta.branch,
    sha: meta.sha,
    dirty: meta.dirty,
  },
  provider: {
    frontendContractVersion: "2.0.0",
    frontendContractDigest: null,
    agentRef: prereq.agentRef,
  },
  topology: {
    backend: backendOrigin,
    orgIdHash,
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
  `${JSON.stringify({ overall, errorCode, outPath, runId }, null, 2)}\n`,
);
if (overall !== "PASS") process.exit(1);
