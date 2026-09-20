// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateFileContent,
  logContentCheckEvent,
} from "./protected-file-detector";
import { detectStrictContentKind } from "./file-security";

describe("protected-file-detector", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pfc-gate-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function write(name: string, data: Buffer | string): string {
    const p = join(dir, name);
    writeFileSync(p, data);
    return p;
  }

  it("passes valid strong-signature files (A-PFC-001)", async () => {
    const pdf = write("valid.pdf", Buffer.from("%PDF-1.7\n"));
    const docx = write("valid.docx", Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const doc = write(
      "valid.doc",
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    );
    const png = write(
      "valid.png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    const jpg = write("valid.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0]));

    for (const [path, name, kind] of [
      [pdf, "valid.pdf", "pdf"],
      [docx, "valid.docx", "zip"],
      [doc, "valid.doc", "ole"],
      [png, "valid.png", "png"],
      [jpg, "valid.jpg", "jpeg"],
    ] as const) {
      const r = await validateFileContent(path, name);
      expect(r.status).toBe("VALID_PLAINTEXT");
      expect(r.actualKind).toBe(kind);
    }
  });

  it("blocks encrypted-looking pdf without %PDF- in first 1024 (A-PFC-002)", async () => {
    const p = write("encrypted.pdf", Buffer.alloc(64, 0x41));
    const r = await validateFileContent(p, "encrypted.pdf");
    expect(r.status).toBe("INVALID_OR_ENCRYPTED");
    expect(r.actualKind).toBe("unknown");
  });

  it("passes pdf with leading junk then %PDF- within 1024 (A-PFC-002b)", async () => {
    const p = write(
      "junk-prefix.pdf",
      Buffer.concat([Buffer.alloc(100, 0x20), Buffer.from("%PDF-1.4\n")]),
    );
    const r = await validateFileContent(p, "junk-prefix.pdf");
    expect(r.status).toBe("VALID_PLAINTEXT");
    expect(r.actualKind).toBe("pdf");
  });

  it("passes OOXML zip signature (A-PFC-003)", async () => {
    const p = write("valid.docx", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]));
    const r = await validateFileContent(p, "valid.docx");
    expect(r.status).toBe("VALID_PLAINTEXT");
    expect(r.actualKind).toBe("zip");
  });

  it("blocks renamed/encrypted OOXML (A-PFC-004)", async () => {
    const p = write("secret.docx", Buffer.from("%PDF-1.7"));
    const r = await validateFileContent(p, "secret.docx");
    expect(r.status).toBe("INVALID_OR_ENCRYPTED");
  });

  it("passes legacy OLE office (A-PFC-005)", async () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    for (const name of ["a.doc", "b.xls", "c.ppt"]) {
      const p = write(name, ole);
      const r = await validateFileContent(p, name);
      expect(r.status).toBe("VALID_PLAINTEXT");
      expect(r.actualKind).toBe("ole");
    }
  });

  it("keeps text and non-strict types NOT_APPLICABLE (A-PFC-006)", async () => {
    for (const [name, body] of [
      ["note.md", "# hello"],
      ["note.txt", Buffer.from([0xc4, 0xe3, 0xba, 0xc3])],
      ["page.html", "<html></html>"],
      ["icon.svg", "<svg></svg>"],
      ["weird.unknown", "xyz"],
    ] as const) {
      const p = write(name, body);
      const r = await validateFileContent(p, name);
      expect(r.status).toBe("NOT_APPLICABLE");
      expect(r.reason).toBe("type-not-applicable");
    }
  });

  it("blocks empty pdf (matrix case 15)", async () => {
    const p = write("empty.pdf", Buffer.alloc(0));
    const r = await validateFileContent(p, "empty.pdf");
    expect(r.status).toBe("INVALID_OR_ENCRYPTED");
    expect(detectStrictContentKind(Buffer.alloc(0))).toBe("unknown");
  });

  it("logs metadata without content marker (A-PFC-010)", async () => {
    const marker = "SMC_SECRET_CONTENT_MARKER_20260920";
    const p = write(
      "marked.pdf",
      Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from(marker)]),
    );
    const r = await validateFileContent(p, "marked.pdf");
    const lines: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    logContentCheckEvent({ validation: r, fileName: "marked.pdf" });
    spy.mockRestore();
    const joined = lines.join("\n");
    expect(joined).toContain("CONTENT_CHECK");
    expect(joined).not.toContain(marker);
    expect(joined).not.toMatch(/prefixHex|base64/i);
  });
});
