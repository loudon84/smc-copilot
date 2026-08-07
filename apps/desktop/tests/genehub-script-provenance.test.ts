import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  assertScriptProvenanceAllowed,
  readScriptProvenance,
  writeScriptProvenance,
} from "../src/main/genehub/script-provenance";
import { GeneHubError } from "../src/shared/genehub/genehub-errors";

let testRoot = "";

beforeEach(() => {
  testRoot = join(tmpdir(), `genehub-provenance-${Date.now()}`);
  mkdirSync(testRoot, { recursive: true });
});

afterEach(() => {
  if (testRoot && existsSync(testRoot)) {
    rmSync(testRoot, { recursive: true, force: true });
  }
});

describe("script-provenance", () => {
  it("blocks overwrite when script exists without provenance", () => {
    const scriptPath = join(testRoot, "helper.py");
    writeFileSync(scriptPath, "print('x')", "utf-8");
    expect(() =>
      assertScriptProvenanceAllowed({
        scriptFullPath: scriptPath,
        geneSlug: "demo",
        jobId: "job_1",
      }),
    ).toThrow(GeneHubError);
  });

  it("allows overwrite when provenance geneSlug matches", () => {
    const scriptPath = join(testRoot, "helper.py");
    writeFileSync(scriptPath, "print('x')", "utf-8");
    writeScriptProvenance(scriptPath, {
      source: "nodeskclaw-genehub",
      jobId: "job_1",
      geneSlug: "demo",
      installedAt: new Date().toISOString(),
    });
    expect(() =>
      assertScriptProvenanceAllowed({
        scriptFullPath: scriptPath,
        geneSlug: "demo",
        jobId: "job_1",
      }),
    ).not.toThrow();
    expect(readScriptProvenance(scriptPath)?.geneSlug).toBe("demo");
  });

  it("blocks when provenance geneSlug mismatches", () => {
    const scriptPath = join(testRoot, "helper.py");
    writeFileSync(scriptPath, "print('x')", "utf-8");
    writeScriptProvenance(scriptPath, {
      source: "nodeskclaw-genehub",
      jobId: "job_old",
      geneSlug: "other",
      installedAt: new Date().toISOString(),
    });
    try {
      assertScriptProvenanceAllowed({
        scriptFullPath: scriptPath,
        geneSlug: "demo",
        jobId: "job_new",
      });
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(GeneHubError);
      expect((err as GeneHubError).code).toBe("GENEHUB_SCRIPT_PROVENANCE_MISMATCH");
    }
  });
});
