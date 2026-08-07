// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createGeneratedFileName,
  resolveUniqueFileName,
  sanitizeGeneratedFileName,
  sanitizeSessionDirSegment,
} from "./generated-file-name";

describe("generated-file-name", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("sanitizes Chinese titles", () => {
    expect(sanitizeGeneratedFileName("客户画像报告")).toBe("客户画像报告");
  });

  it("strips Windows-illegal characters", () => {
    expect(sanitizeGeneratedFileName('a<>:"/\\|?*b')).toBe("a---------b");
  });

  it("falls back for empty titles", () => {
    expect(sanitizeGeneratedFileName("   ")).toBe("generated-report");
  });

  it("truncates long titles to 80 chars", () => {
    const long = "x".repeat(120);
    expect(sanitizeGeneratedFileName(long).length).toBe(80);
  });

  it("creates names with extension", () => {
    expect(createGeneratedFileName("客户画像报告", "md")).toBe(
      "客户画像报告.md",
    );
  });

  it("resolves unique names with (1) (2) suffix", () => {
    dir = mkdtempSync(join(tmpdir(), "gen-name-"));
    writeFileSync(join(dir, "report.md"), "a");
    expect(resolveUniqueFileName(dir, "report.md")).toBe("report (1).md");
    writeFileSync(join(dir, "report (1).md"), "b");
    expect(resolveUniqueFileName(dir, "report.md")).toBe("report (2).md");
  });

  it("sanitizes session directory segments", () => {
    expect(sanitizeSessionDirSegment("../evil/../x")).toBe("--evil---x");
    expect(sanitizeSessionDirSegment("")).toBe("session");
  });
});
