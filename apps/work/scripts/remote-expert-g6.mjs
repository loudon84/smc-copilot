#!/usr/bin/env node
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  atomicWriteJson,
  collectAssertions,
  evaluateG6,
  evidenceContainsSecrets,
  gitMeta,
  runInReleaseWorktree,
  toolVersions,
  verifyEvidenceSha,
} from "./lib/remote-expert-evidence.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(ROOT, "..", "..");
const outPath = join(ROOT, "test-results", "remote-expert-g6.json");
const vitestJsonPath = join(ROOT, "test-results", "remote-expert-g6-vitest.json");

const LEGACY_ACCEPTANCE = [
  "A-CONTRACT-001",
  "A-CATALOG-001",
  "A-TRANSPORT-001",
  "A-SESSION-001",
  "A-PROMPT-001",
  "A-RECONNECT-001",
  "A-PERM-001",
  "A-CANCEL-001",
  "A-ATTACH-001",
  "A-ARTIFACT-001",
  "A-UI-001",
  "A-PERSIST-001",
  "A-MIGRATE-001",
  "A-SEC-001",
  "A-OBS-001",
  "A-NEG-CONTRACT-001",
  "A-NEG-CATALOG-001",
  "A-NEG-TRANSPORT-001",
  "A-NEG-SESSION-001",
  "A-NEG-PROMPT-001",
  "A-NEG-RECONNECT-001",
  "A-NEG-PERM-001",
  "A-NEG-CANCEL-001",
  "A-NEG-ATTACH-001",
  "A-NEG-ARTIFACT-001",
  "A-NEG-UI-001",
  "A-NEG-PERSIST-001",
  "A-NEG-MIGRATE-001",
  "A-NEG-SEC-001",
  "A-NEG-OBS-001",
];

const CLOSURE_ACCEPTANCE = [
  "A-UI-ENTRY-001",
  "A-NEG-UI-ENTRY-001",
  "A-NEG-UI-ENTRY-002",
  "A-STATE-AVAIL-001",
  "A-NEG-STATE-AVAIL-001",
  "A-CATALOG-GATE-001",
  "A-CATALOG-EMPTY-001",
  "A-CATALOG-READY-001",
  "A-NEG-CATALOG-GATE-001",
  "A-RUN-TRANSITION-001",
  "A-RUN-TRANSITION-002",
  "A-RUN-TRANSITION-003",
  "A-NEG-RUN-TRANSITION-001",
  "A-UI-SWITCH-001",
  "A-UI-SWITCH-002",
  "A-NEG-UI-SWITCH-001",
  "A-NEG-UI-SWITCH-002",
  "A-ROUTE-REMOTE-001",
  "A-ROUTE-LOCAL-001",
  "A-NEG-ROUTE-FALLBACK-001",
  "A-TEST-ENTRY-001",
  "A-NEG-TEST-ENTRY-001",
  "A-EVID-G6-001",
  "A-NEG-EVID-G6-001",
  "A-NEG-EVID-G6-002",
  "A-OBS-CLOSURE-001",
  "A-NEG-OBS-CLOSURE-001",
  "A-NEG-SEC-CLOSURE-001",
  "A-NEG-SEC-CLOSURE-002",
  "A-NEG-SEC-CLOSURE-003",
  "A-NEG-SEC-CLOSURE-004",
  "A-NEG-G7-RUNNER-001",
  "A-NEG-G7-RUNNER-002",
];

const ACCEPTANCE = [...LEGACY_ACCEPTANCE, ...CLOSURE_ACCEPTANCE];

const args = process.argv.slice(2);
const releaseWorktree = args.includes("--release-worktree");
const verifyOnly = args.includes("--verify-evidence");

if (
  releaseWorktree &&
  process.env.SMC_REMOTE_EXPERT_EVIDENCE_NO_WORKTREE !== "1"
) {
  const result = runInReleaseWorktree({
    repoRoot: REPO,
    runnerRel: "scripts/remote-expert-g6.mjs",
    args: args.filter((a) => a !== "--release-worktree"),
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.status);
}

if (verifyOnly) {
  const meta = gitMeta(REPO);
  if (!existsSync(outPath)) {
    process.stderr.write("G6 evidence missing\n");
    process.exit(1);
  }
  const verified = verifyEvidenceSha(outPath, meta.sha);
  if (!verified.ok) {
    process.stdout.write(
      `${JSON.stringify({ overall: "FAIL", errorCode: verified.errorCode }, null, 2)}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `${JSON.stringify({ overall: "PASS", commitSha: verified.sha }, null, 2)}\n`,
  );
  process.exit(0);
}

function run(cmd, cmdArgs) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: (result.stderr ?? "") + (result.error ? String(result.error) : ""),
  };
}

function resolveNodeTool(binName, mjsParts) {
  const localCmd = join(
    ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${binName}.cmd` : binName,
  );
  if (existsSync(localCmd)) {
    return { cmd: localCmd, prefix: [] };
  }
  const mjs = join(ROOT, ...mjsParts);
  if (existsSync(mjs)) {
    return { cmd: process.execPath, prefix: [mjs] };
  }
  return { cmd: binName, prefix: [] };
}

mkdirSync(dirname(vitestJsonPath), { recursive: true });
const meta = gitMeta(REPO);
const versions = toolVersions(ROOT);

const typecheck = run("npm", ["run", "typecheck"]);
const vitestTool = resolveNodeTool("vitest", ["node_modules", "vitest", "vitest.mjs"]);
const vitest = run(vitestTool.cmd, [
  ...vitestTool.prefix,
  "run",
  "src/main/remote-expert",
  "src/renderer/src/modules/remote-expert",
  "src/renderer/src/screens/Chat/Chat.remote-expert-hotfix.test.tsx",
  "src/renderer/src/screens/Chat/Chat.remote-expert-entry.test.tsx",
  "src/renderer/src/screens/Chat/Chat.remote-expert-entry-mutation.test.tsx",
  "src/renderer/src/screens/Layout/chatRuns.test.ts",
  "src/renderer/src/screens/Layout/useRemoteExpertRunTransition.test.ts",
  "src/shared/remote-expert.test.ts",
  "src/main/auth/auth-ipc.test.ts",
  "tests/remote-expert",
  "tests/ipc-handlers.test.ts",
  "--exclude",
  "tests/remote-expert/live/**",
  "--reporter=json",
  `--outputFile=${vitestJsonPath}`,
]);
const latLocal = join(
  ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "lat.cmd" : "lat",
);
const lat = existsSync(latLocal)
  ? run(latLocal, ["check"])
  : run(process.platform === "win32" ? "lat.cmd" : "npx", process.platform === "win32" ? ["check"] : ["lat", "check"]);

let report = { testResults: [] };
try {
  report = JSON.parse(readFileSync(vitestJsonPath, "utf8"));
} catch {
  report = { testResults: [] };
}

const assertions = collectAssertions(report);
const commands = [
  { name: "typecheck", exitCode: typecheck.status },
  { name: "vitest", exitCode: vitest.status },
  { name: "lat check", exitCode: lat.status },
];

const requiredForSuite = ACCEPTANCE.filter((id) => id !== "A-EVID-G6-001");
const evaluated = evaluateG6({
  commands,
  assertions,
  required: requiredForSuite,
  dirty: meta.dirty,
});

// A-EVID-G6-001 is proven by this runner producing clean PASS evidence.
evaluated.byId["A-EVID-G6-001"] = {
  status:
    !meta.dirty && evaluated.overall === "PASS" ? "PASS" : meta.dirty ? "BLOCKED" : "FAIL",
  evidence: [
    {
      title: "[A-EVID-G6-001] g6 runner commit-bound evidence",
      file: "scripts/remote-expert-g6.mjs",
      status:
        !meta.dirty && evaluated.overall === "PASS" ? "PASS" : "FAIL",
    },
  ],
};
evaluated.cases["A-EVID-G6-001"] = evaluated.byId["A-EVID-G6-001"].status;
if (evaluated.cases["A-EVID-G6-001"] !== "PASS" && evaluated.overall === "PASS") {
  evaluated.overall = "FAIL";
  evaluated.errorCode = "G6_REQUIRED_ACCEPTANCE_FAILED";
}

evaluated.cases["Local Chat regression"] =
  vitest.status === 0 ? "PASS" : "FAIL";
evaluated.cases["SkillRun regression"] =
  vitest.status === 0 ? "PASS" : "FAIL";
if (
  (evaluated.cases["Local Chat regression"] === "FAIL" ||
    evaluated.cases["SkillRun regression"] === "FAIL") &&
  evaluated.overall === "PASS"
) {
  evaluated.overall = "FAIL";
  evaluated.errorCode = "G6_REQUIRED_ACCEPTANCE_FAILED";
}

const evidence = {
  gate: "G6",
  overall: evaluated.overall,
  errorCode: evaluated.errorCode,
  repo: meta.repo,
  branch: meta.branch,
  commitSha: meta.sha,
  dirty: meta.dirty,
  generatedAt: new Date().toISOString(),
  commands,
  cases: evaluated.cases,
  byId: evaluated.byId,
  toolVersions: versions,
  evidenceFiles: [outPath],
  vitestExitCode: vitest.status,
  vitestStderrTail: vitest.stderr.slice(-4000),
};

const serialized = JSON.stringify(evidence, null, 2);
if (evidenceContainsSecrets(serialized)) {
  try {
    if (existsSync(outPath)) unlinkSync(outPath);
  } catch {
    /* ignore */
  }
  process.stdout.write(
    `${JSON.stringify({
      overall: "FAIL",
      errorCode: "REMOTE_EXPERT_EVIDENCE_SECRET_LEAK",
      outPath,
    }, null, 2)}\n`,
  );
  process.exit(1);
}

atomicWriteJson(outPath, evidence);
process.stdout.write(
  `${JSON.stringify({ overall: evidence.overall, errorCode: evidence.errorCode, outPath }, null, 2)}\n`,
);
if (evidence.overall !== "PASS") process.exit(1);
