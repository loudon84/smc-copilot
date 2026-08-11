// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Attachment } from "../../shared/attachments";
import type { ManagedFile, ParsedDocument } from "../../shared/files";

const mockState = vi.hoisted(() => ({ hermesHome: "" }));

vi.mock("../installer", () => ({
  get HERMES_HOME() {
    return mockState.hermesHome;
  },
}));

describe("attachment-adapter", () => {
  beforeEach(() => {
    mockState.hermesHome = mkdtempSync(join(tmpdir(), "hermes-files-adapt-"));
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(mockState.hermesHome, { recursive: true, force: true });
  });

  async function load() {
    return import("./attachment-adapter");
  }

  it("maps Attachment to ManagedFile", async () => {
    const adapter = await load();
    const attachment: Attachment = {
      id: "att-1",
      kind: "path-ref",
      name: "report.pdf",
      mime: "application/pdf",
      size: 1234,
      path: "C:\\docs\\report.pdf",
    };
    const managed = await adapter.toManagedFile(attachment, {
      profileId: "default",
      sessionId: "s1",
      source: "picker",
    });
    expect(managed).toMatchObject({
      id: "att-1",
      name: "report.pdf",
      category: "pdf",
      source: "picker",
      originalPath: "C:\\docs\\report.pdf",
    });
  });

  it("maps small text ManagedFile to text-file Attachment", async () => {
    const adapter = await load();
    const textPath = join(mockState.hermesHome, "notes.txt");
    writeFileSync(textPath, "hello adapter");
    const file: ManagedFile = {
      id: "f1",
      profileId: "default",
      name: "notes.txt",
      extension: "txt",
      mime: "text/plain",
      category: "text",
      source: "picker",
      status: "ready",
      size: 13,
      originalPath: textPath,
      managedPath: textPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const att = await adapter.toHermesAttachment(file, { mode: "local" });
    expect(att.kind).toBe("text-file");
    expect(att.text).toBe("hello adapter");
  });

  it("rejects remote path-ref when no parsed text is available", async () => {
    const adapter = await load();
    const pdfPath = join(mockState.hermesHome, "big.pdf");
    writeFileSync(pdfPath, "%PDF-1.4 remote-unsupported");
    const file: ManagedFile = {
      id: "f2",
      profileId: "default",
      name: "big.pdf",
      extension: "pdf",
      mime: "application/pdf",
      category: "pdf",
      source: "picker",
      status: "ready",
      size: 32,
      originalPath: pdfPath,
      managedPath: pdfPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(() =>
      adapter.toHermesAttachment(file, { mode: "remote" }),
    ).toThrow();
    try {
      adapter.toHermesAttachment(file, { mode: "remote" });
    } catch (err) {
      expect(err).toMatchObject({
        fileError: { code: "FILE_REMOTE_UNSUPPORTED" },
      });
    }
  });

  it("remote mode uses parsed text instead of path-ref", async () => {
    const adapter = await load();
    const file: ManagedFile = {
      id: "f3",
      profileId: "default",
      name: "deck.pptx",
      extension: "pptx",
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      category: "presentation",
      source: "picker",
      status: "parsed",
      size: 99999,
      originalPath: "C:\\secret\\deck.pptx",
      managedPath: "C:\\secret\\deck.pptx",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const parsed: ParsedDocument = {
      fileId: "f3",
      parserId: "markitdown",
      parserVersion: 1,
      text: "slide contents",
      sections: [],
      metadata: {},
      truncated: false,
      parsedAt: new Date().toISOString(),
    };
    const att = await adapter.toHermesAttachment(file, {
      mode: "remote",
      parsed,
    });
    expect(att.kind).toBe("text-file");
    expect(att.text).toBe("slide contents");
    expect(att.path).toBeUndefined();
  });
});
