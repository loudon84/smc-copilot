#!/usr/bin/env node
import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  atomicWriteJson,
  evidenceContainsSecrets,
  gitMeta,
} from "./lib/remote-expert-evidence.mjs";
import { isClaimWindowOpen } from "./lib/remote-expert-g7-evidence.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(ROOT, "..", "..");

function usage() {
  process.stderr.write(
    "Usage: node scripts/remote-expert-pg-claim.mjs --evidence <path> --provenance <path> --engineering-signoff <id> --product-signoff <id> [--desktop-version <semver>] [--desktop-commit <sha>]\n",
  );
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (!val || val.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = val;
    i += 1;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  usage();
  process.exit(0);
}

const evidencePath = resolve(
  args.evidence || join(ROOT, "test-results", "remote-expert-g7.json"),
);
const provenancePath = args.provenance ? resolve(args.provenance) : "";
const engineering = String(args["engineering-signoff"] ?? "").trim();
const product = String(args["product-signoff"] ?? "").trim();
const desktopVersionArg = String(args["desktop-version"] ?? "").trim();
const desktopCommitArg = String(args["desktop-commit"] ?? "").trim();
const claimOut = join(ROOT, "test-results", "claim-authorized.json");

function fail(errorCode, reason) {
  process.stdout.write(
    `${JSON.stringify({ overall: "FAIL", errorCode, reason }, null, 2)}\n`,
  );
  process.exit(1);
}

if (!existsSync(evidencePath)) {
  fail("PG_CLAIM_EVIDENCE_MISSING", `evidence not found: ${evidencePath}`);
}
if (!provenancePath || !existsSync(provenancePath)) {
  fail("PG_CLAIM_PROVENANCE_MISSING", "provenance file required");
}
if (!engineering || !product) {
  fail("PG_CLAIM_SIGNOFF_MISSING", "engineering and product signoff required");
}

let evidence;
try {
  evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
} catch (err) {
  fail(
    "PG_CLAIM_EVIDENCE_INVALID",
    err instanceof Error ? err.message : String(err),
  );
}

if (evidence.gate === "G7-PRERUN") {
  fail("PG_CLAIM_PRERUN_FORBIDDEN", "prerun evidence cannot authorize claim");
}
if (evidence.overall !== "PASS" || evidence.productionGate !== "passed") {
  fail(
    "PG_CLAIM_GATE_NOT_PASSED",
    "evidence.overall must be PASS and productionGate=passed",
  );
}
if (!isClaimWindowOpen(evidence)) {
  fail("PG_CLAIM_EXPIRED", "claim window expired or expiresAt missing");
}

let provenanceRaw = "";
try {
  provenanceRaw = readFileSync(provenancePath, "utf8");
} catch (err) {
  fail(
    "PG_CLAIM_PROVENANCE_UNREADABLE",
    err instanceof Error ? err.message : String(err),
  );
}
if (evidenceContainsSecrets(provenanceRaw, [])) {
  fail("PG_CLAIM_PROVENANCE_SECRET_LEAK", "provenance contains secret material");
}

const meta = gitMeta(REPO);
const desktopVersion =
  desktopVersionArg ||
  evidence.desktopVersion ||
  null;
const desktopCommit = desktopCommitArg || meta.sha || evidence.consumer?.sha || null;
const claimAuthorizedAt = new Date().toISOString();

const updated = {
  ...evidence,
  claimAuthorized: true,
  claimAuthorizedAt,
  desktopVersion,
  desktopCommit,
  engineeringSignoff: engineering,
  productSignoff: product,
  provenancePath: provenancePath.replace(/\\/g, "/"),
};

const serialized = JSON.stringify(updated, null, 2);
if (evidenceContainsSecrets(serialized, [])) {
  fail("REMOTE_EXPERT_EVIDENCE_SECRET_LEAK", "claim evidence secret leak");
}

atomicWriteJson(evidencePath, updated);

const claimRecord = {
  overall: "PASS",
  claimAuthorized: true,
  claimAuthorizedAt,
  productionGate: updated.productionGate,
  passedAt: updated.passedAt,
  expiresAt: updated.expiresAt,
  desktopVersion,
  desktopCommit,
  engineeringSignoff: engineering,
  productSignoff: product,
  evidencePath: evidencePath.replace(/\\/g, "/"),
  evidenceSha: updated.consumer?.sha ?? null,
  provenancePath: updated.provenancePath,
  generatedAt: claimAuthorizedAt,
};

atomicWriteJson(claimOut, claimRecord);
process.stdout.write(
  `${JSON.stringify({ overall: "PASS", claimOut, evidencePath }, null, 2)}\n`,
);
