/**
 * MarkItDown parser falls back to coarse office/pdf parsers.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

vi.mock("../conversion", async () => {
  const actual = await vi.importActual<typeof import("../conversion")>(
    "../conversion",
  );
  return {
    ...actual,
    createLocalMarkItDownProvider: vi.fn(),
  };
});

vi.mock("../file-config", () => ({
  readDesktopFilesConfig: () => ({
    parsing: {
      enabled: true,
      concurrency: 2,
      officeParser: "markitdown",
      pdfParser: "markitdown",
      ocrEnabled: false,
      markitdownBin: "",
      markitdownTimeoutMs: 60_000,
    },
    maxParseMb: 50,
  }),
}));

import { createLocalMarkItDownProvider } from "../conversion";
import { FilePlatformError } from "../file-security";
import { markitdownParser } from "./markitdown-parser";
import { resetDefaultParserRegistry } from "../file-parser-registry";

const createMock = vi.mocked(createLocalMarkItDownProvider);

describe("markitdownParser", () => {
  let dir: string;

  afterEach(() => {
    resetDefaultParserRegistry();
    createMock.mockReset();
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it("supports pdf/office when config selects markitdown", () => {
    expect(
      markitdownParser.supports({
        fileId: "1",
        path: "/a.pdf",
        name: "a.pdf",
        extension: "pdf",
        mime: "application/pdf",
        size: 10,
      }),
    ).toBe(true);
    expect(
      markitdownParser.supports({
        fileId: "2",
        path: "/a.docx",
        name: "a.docx",
        extension: "docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 10,
      }),
    ).toBe(true);
  });

  it("returns markitdown markdown on success", async () => {
    dir = mkdtempSync(join(tmpdir(), "mdp-"));
    const filePath = join(dir, "a.pdf");
    writeFileSync(filePath, "%PDF-1.4");

    createMock.mockReturnValue({
      id: "markitdown",
      convert: vi.fn().mockResolvedValue({
        markdown: "# From MarkItDown",
        metadata: { provider: "markitdown" },
      }),
      probe: vi.fn(),
    } as never);

    const doc = await markitdownParser.parse({
      fileId: "f1",
      path: filePath,
      name: "a.pdf",
      extension: "pdf",
      mime: "application/pdf",
      size: 8,
    });
    expect(doc.parserId).toBe("markitdown");
    expect(doc.text).toContain("From MarkItDown");
  });

  it("falls back to coarse pdf parser when MarkItDown is unavailable", async () => {
    dir = mkdtempSync(join(tmpdir(), "mdp-"));
    const filePath = join(dir, "a.pdf");
    // Minimal PDF with a BT/ET text operators so coarse parser extracts something.
    const pdf =
      "%PDF-1.4\n1 0 obj<<>>endobj\nBT (HelloCoarse) Tj ET\n";
    writeFileSync(filePath, pdf);

    createMock.mockReturnValue({
      id: "markitdown",
      convert: vi.fn().mockRejectedValue(
        FilePlatformError.fromCode(
          "FILE_NOT_IMPLEMENTED",
          "MarkItDown CLI is not available",
          { retryable: false },
        ),
      ),
      probe: vi.fn(),
    } as never);

    const doc = await markitdownParser.parse({
      fileId: "f2",
      path: filePath,
      name: "a.pdf",
      extension: "pdf",
      mime: "application/pdf",
      size: pdf.length,
    });
    expect(doc.metadata?.markitdownFallback).toBe(true);
    expect(doc.parserId).toBe("pdf");
  });
});
