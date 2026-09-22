// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  assertUploadBytesReadable,
  logUploadByteCheckEvent,
} from "./upload-byte-gate";

describe("upload-byte-gate", () => {
  it("passes valid pdf buffer (A-UBG-001)", () => {
    const r = assertUploadBytesReadable(
      "ok.pdf",
      Buffer.from("%PDF-1.7\n%EOF\n"),
    );
    expect(r.status).toBe("PASS");
    expect(r.actualKind).toBe("pdf");
  });

  it("rejects pdf without %PDF- marker (A-UBG-002)", () => {
    const r = assertUploadBytesReadable("cipher.pdf", Buffer.alloc(64, 0x11));
    expect(r.status).toBe("REJECT");
    expect(r.reason).toBe("signature-mismatch");
  });

  it("rejects empty pdf (empty-bytes)", () => {
    const r = assertUploadBytesReadable("empty.pdf", Buffer.alloc(0));
    expect(r.status).toBe("REJECT");
    expect(r.reason).toBe("empty-bytes");
  });

  it("rejects docx without ZIP signature (A-UBG-004)", () => {
    const r = assertUploadBytesReadable("bad.docx", Buffer.from("%PDF-1.7"));
    expect(r.status).toBe("REJECT");
  });

  it("passes docx with ZIP signature", () => {
    const r = assertUploadBytesReadable(
      "ok.docx",
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]),
    );
    expect(r.status).toBe("PASS");
    expect(r.actualKind).toBe("zip");
  });

  it("passes ole doc/xls", () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(assertUploadBytesReadable("a.doc", ole).status).toBe("PASS");
    expect(assertUploadBytesReadable("b.xls", ole).status).toBe("PASS");
  });

  it("skips text/md as NOT_APPLICABLE (A-UBG-005)", () => {
    expect(assertUploadBytesReadable("n.txt", Buffer.from("hi")).status).toBe(
      "NOT_APPLICABLE",
    );
    expect(assertUploadBytesReadable("n.md", Buffer.from("# x")).status).toBe(
      "NOT_APPLICABLE",
    );
  });

  it("skips pptx/images (not in Knowledge STRICT set)", () => {
    expect(
      assertUploadBytesReadable("x.pptx", Buffer.from([0x50, 0x4b, 0x03, 0x04]))
        .status,
    ).toBe("NOT_APPLICABLE");
    expect(
      assertUploadBytesReadable(
        "x.png",
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ).status,
    ).toBe("NOT_APPLICABLE");
  });

  it("logs metadata without content marker (A-UBG-008)", () => {
    const marker = "SMC_SECRET_CONTENT_MARKER_20260921";
    const buf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from(marker)]);
    const r = assertUploadBytesReadable("marked.pdf", buf);
    const lines: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((...args) => {
      lines.push(args.map(String).join(" "));
    });
    logUploadByteCheckEvent({ result: r, fileName: "marked.pdf" });
    spy.mockRestore();
    const joined = lines.join("\n");
    expect(joined).toContain("CONTENT_UPLOAD_CHECK");
    expect(joined).not.toContain(marker);
  });
});
