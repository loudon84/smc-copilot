// @vitest-environment jsdom
/**
 * PRD §25 fixture-driven security / sanitize / oversized regression.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { isDeniedExtension } from "../../src/main/files/file-security";
import { sanitizeSvg } from "../../src/renderer/src/components/rich-content/sanitize-svg";
import { DEFAULT_DESKTOP_FILES_CONFIG } from "../../src/shared/files";
import { assertImportAllowed } from "../../src/main/files/file-security";

const FIXTURES = resolve(__dirname, "../fixtures/files");

describe("PRD §25 fixture regressions", () => {
  it("lists the required synthetic fixtures", () => {
    for (const name of [
      "plain-utf8.txt",
      "chinese-gbk.txt",
      "sample.md",
      "sample.ts",
      "sample.csv",
      "sample.json",
      "sample.pdf",
      "scanned.pdf",
      "sample.docx",
      "sample.xlsx",
      "sample.pptx",
      "sample.epub",
      "image.png",
      "malicious.svg",
      "malicious.html",
      "oversized.txt",
      "no-extension",
      "fake-pdf.exe",
    ]) {
      expect(existsSync(resolve(FIXTURES, name)), name).toBe(true);
    }
  });

  it("denies fake-pdf.exe by extension", () => {
    expect(isDeniedExtension("fake-pdf.exe")).toBe(true);
    const err = assertImportAllowed(
      "fake-pdf.exe",
      17,
      DEFAULT_DESKTOP_FILES_CONFIG,
    );
    expect(err?.code).toBe("FILE_TYPE_DENIED");
  });

  it("rejects oversized.txt against a 1MB import cap", () => {
    const size = readFileSync(resolve(FIXTURES, "oversized.txt")).length;
    const err = assertImportAllowed("oversized.txt", size, {
      ...DEFAULT_DESKTOP_FILES_CONFIG,
      maxImportMb: 1,
    });
    expect(err?.code).toBe("FILE_TOO_LARGE");
  });

  it("sanitizes malicious.svg scripts and on* handlers", () => {
    const raw = readFileSync(resolve(FIXTURES, "malicious.svg"), "utf8");
    const cleaned = sanitizeSvg(raw);
    expect(cleaned).toBeTruthy();
    expect(cleaned!.toLowerCase()).not.toContain("<script");
    expect(cleaned!.toLowerCase()).not.toMatch(/\sonload\s*=/i);
  });

  it("reads chinese-gbk.txt as non-empty GBK bytes", () => {
    const buf = readFileSync(resolve(FIXTURES, "chinese-gbk.txt"));
    expect(buf.length).toBeGreaterThan(0);
    expect(buf[0]).toBe(0xc4);
  });
});
