import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CLAIM = join(ROOT, "scripts/remote-expert-pg-claim.mjs");

function baseEvidence(overrides: Record<string, unknown> = {}) {
  const passedAt = "2026-10-07T12:00:00.000Z";
  const expiresAt = "2026-10-21T12:00:00.000Z";
  return {
    gate: "G7",
    overall: "PASS",
    productionGate: "passed",
    claimAuthorized: false,
    passedAt,
    expiresAt,
    desktopVersion: "0.7.15",
    consumer: { sha: "abc123", dirty: false },
    cases: { "A-G7-LIVE-001": "PASS" },
    ...overrides,
  };
}

describe("remote-expert-pg-claim [A-PG-2108]", () => {
  it("flips claimAuthorized when provenance and dual signoff present", () => {
    const dir = mkdtempSync(join(tmpdir(), "pg-claim-"));
    const evidencePath = join(dir, "remote-expert-g7.json");
    const provenancePath = join(dir, "work-build-info.json");
    writeFileSync(evidencePath, JSON.stringify(baseEvidence(), null, 2));
    writeFileSync(
      provenancePath,
      JSON.stringify({ buildId: "build-1", package: "apps/work" }, null, 2),
    );
    const result = spawnSync(
      process.execPath,
      [
        CLAIM,
        "--evidence",
        evidencePath,
        "--provenance",
        provenancePath,
        "--engineering-signoff",
        "eng@example.com",
        "--product-signoff",
        "pm@example.com",
        "--desktop-version",
        "0.7.15",
        "--desktop-commit",
        "abc123",
      ],
      { encoding: "utf8", cwd: ROOT },
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
    const updated = JSON.parse(readFileSync(evidencePath, "utf8"));
    expect(updated.claimAuthorized).toBe(true);
    expect(updated.engineeringSignoff).toBe("eng@example.com");
    expect(updated.productSignoff).toBe("pm@example.com");
    expect(existsSync(join(ROOT, "test-results", "claim-authorized.json"))).toBe(
      true,
    );
  });

  it("rejects expired evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "pg-claim-exp-"));
    const evidencePath = join(dir, "remote-expert-g7.json");
    const provenancePath = join(dir, "work-build-info.json");
    writeFileSync(
      evidencePath,
      JSON.stringify(
        baseEvidence({
          passedAt: "2026-01-01T00:00:00.000Z",
          expiresAt: "2026-01-15T00:00:00.000Z",
        }),
        null,
        2,
      ),
    );
    writeFileSync(provenancePath, "{}");
    const result = spawnSync(
      process.execPath,
      [
        CLAIM,
        "--evidence",
        evidencePath,
        "--provenance",
        provenancePath,
        "--engineering-signoff",
        "eng",
        "--product-signoff",
        "pm",
      ],
      { encoding: "utf8", cwd: ROOT },
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("PG_CLAIM_EXPIRED");
    const updated = JSON.parse(readFileSync(evidencePath, "utf8"));
    expect(updated.claimAuthorized).toBe(false);
  });

  it("rejects missing product signoff", () => {
    const dir = mkdtempSync(join(tmpdir(), "pg-claim-sign-"));
    const evidencePath = join(dir, "remote-expert-g7.json");
    const provenancePath = join(dir, "work-build-info.json");
    writeFileSync(evidencePath, JSON.stringify(baseEvidence(), null, 2));
    writeFileSync(provenancePath, "{}");
    const result = spawnSync(
      process.execPath,
      [
        CLAIM,
        "--evidence",
        evidencePath,
        "--provenance",
        provenancePath,
        "--engineering-signoff",
        "eng",
      ],
      { encoding: "utf8", cwd: ROOT },
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("PG_CLAIM_SIGNOFF_MISSING");
  });
});
