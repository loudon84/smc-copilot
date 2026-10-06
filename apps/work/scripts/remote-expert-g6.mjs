#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(ROOT, "test-results", "remote-expert-g6.json");
const vitestJsonPath = join(ROOT, "test-results", "remote-expert-g6-vitest.json");
mkdirSync(dirname(vitestJsonPath), { recursive: true });

const ACCEPTANCE = [
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

const ID_RE = /\[(A-(?:NEG-)?[A-Z]+-\d+)\]/g;

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

const vitest = run("npx", [
  "vitest",
  "run",
  "src/main/remote-expert",
  "src/renderer/src/modules/remote-expert",
  "src/renderer/src/screens/Chat/Chat.remote-expert-hotfix.test.tsx",
  "src/shared/remote-expert.test.ts",
  "src/main/auth/auth-ipc.test.ts",
  "tests/remote-expert",
  "tests/ipc-handlers.test.ts",
  "--reporter=json",
  `--outputFile=${vitestJsonPath}`,
]);

function collectAssertions(report) {
  const rows = [];
  const files = report?.testResults ?? [];
  for (const file of files) {
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

let report = { testResults: [] };
try {
  report = JSON.parse(readFileSync(vitestJsonPath, "utf8"));
} catch {
  report = { testResults: [] };
}

const assertions = collectAssertions(report);
const byId = Object.fromEntries(
  ACCEPTANCE.map((id) => [id, { status: "UNCOVERED", evidence: [] }]),
);

for (const assertion of assertions) {
  const ids = [...assertion.title.matchAll(ID_RE)].map((m) => m[1]);
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

const cases = Object.fromEntries(
  ACCEPTANCE.map((id) => [id, byId[id].status]),
);
cases["Local Chat regression"] = vitest.status === 0 ? "PASS" : "FAIL";
cases["SkillRun regression"] = vitest.status === 0 ? "PASS" : "FAIL";

const failed = Object.values(cases).some((status) => status === "FAIL");
const uncovered = Object.values(cases).some((status) => status === "UNCOVERED");
const blocked = Object.values(cases).some((status) => status === "BLOCKED");
const overall = failed || uncovered || blocked ? "FAIL" : "PASS";

const evidence = {
  gate: "G6",
  overall,
  generatedAt: new Date().toISOString(),
  vitestExitCode: vitest.status,
  cases,
  byId,
  vitestStderrTail: vitest.stderr.slice(-4000),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ overall, outPath }, null, 2)}\n`);
if (overall !== "PASS") process.exit(1);
