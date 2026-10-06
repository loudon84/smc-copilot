#!/usr/bin/env node
import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(ROOT, "..", "..");
const outPath = join(ROOT, "test-results", "remote-expert-g7.json");

const CASES = Array.from({ length: 15 }, (_, i) => String(i + 1));

function gitMeta(cwd) {
  try {
    const sha = execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain", {
      cwd,
      encoding: "utf8",
    }).trim();
    return { sha, dirty: dirty.length > 0 };
  } catch {
    return { sha: null, dirty: null };
  }
}

const enabled = process.env.SMC_REMOTE_EXPERT_G7 === "1";
const backend = process.env.SMC_REMOTE_EXPERT_G7_BACKEND_URL?.trim() ?? "";
const token = process.env.SMC_REMOTE_EXPERT_G7_TOKEN?.trim() ?? "";
const orgId = process.env.SMC_REMOTE_EXPERT_G7_ORG_ID?.trim() ?? "";
const agentRef = process.env.SMC_REMOTE_EXPERT_G7_AGENT_REF?.trim() ?? "";

const caseStatus = Object.fromEntries(
  CASES.map((id) => [
    id,
    enabled && backend && token && orgId && agentRef ? "BLOCKED" : "BLOCKED",
  ]),
);

const reason = !enabled
  ? "SMC_REMOTE_EXPERT_G7 is not set; live Golden Consumer is BLOCKED (not PASS)"
  : !backend || !token || !orgId || !agentRef
    ? "Live G7 environment variables are incomplete"
    : "Live G7 harness requires a real backend/agent/Remote Hermes topology; this runner records BLOCKED until the operator executes the 15-case matrix";

const evidence = {
  gate: "G7",
  overall: "BLOCKED",
  generatedAt: new Date().toISOString(),
  reason,
  consumer: gitMeta(REPO),
  cases: caseStatus,
  envPresent: {
    SMC_REMOTE_EXPERT_G7: enabled,
    backend: Boolean(backend),
    token: Boolean(token),
    orgId: Boolean(orgId),
    agentRef: Boolean(agentRef),
  },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ overall: "BLOCKED", outPath, reason }, null, 2)}\n`);
process.exit(1);
