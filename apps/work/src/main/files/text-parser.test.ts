// @vitest-environment node
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileParserInput } from "../../shared/files";

const mockState = vi.hoisted(() => ({ hermesHome: "" }));

vi.mock("../installer", () => ({
  get HERMES_HOME() {
    return mockState.hermesHome;
  },
}));

describe("text-parser", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hermes-text-parser-"));
    mockState.hermesHome = dir;
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function inputFor(name: string, path: string, size: number): FileParserInput {
    const ext = name.includes(".") ? name.split(".").pop()! : "";
    return {
      fileId: "file-1",
      path,
      name,
      extension: ext,
      mime: "text/plain",
      size,
    };
  }

  it("reads utf-8 text files", async () => {
    const { textParser } = await import("./parsers/text-parser");
    const path = join(dir, "hello.txt");
    writeFileSync(path, "hello file platform", "utf8");
    const doc = await textParser.parse(
      inputFor("hello.txt", path, Buffer.byteLength("hello file platform")),
    );
    expect(doc.parserId).toBe("text");
    expect(doc.text).toContain("hello file platform");
    expect(doc.truncated).toBe(false);
    expect(doc.metadata.encoding).toBe("utf-8");
  });

  it("sniffs utf-8 BOM", async () => {
    const { textParser } = await import("./parsers/text-parser");
    const path = join(dir, "bom.txt");
    writeFileSync(path, Buffer.from([0xef, 0xbb, 0xbf, 0x41, 0x42, 0x43]));
    const doc = await textParser.parse(inputFor("bom.txt", path, 6));
    expect(doc.text).toBe("ABC");
    expect(doc.metadata.encoding).toBe("utf-8");
  });

  it("sniffs utf-16le BOM", async () => {
    const { textParser } = await import("./parsers/text-parser");
    const path = join(dir, "u16.txt");
    // BOM FF FE + "Hi" as UTF-16LE
    writeFileSync(
      path,
      Buffer.from([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]),
    );
    const doc = await textParser.parse(inputFor("u16.txt", path, 6));
    expect(doc.text).toBe("Hi");
    expect(doc.metadata.encoding).toBe("utf-16le");
  });

  it("supports only text-ish extensions/mimes", async () => {
    const { textParser } = await import("./parsers/text-parser");
    expect(
      textParser.supports(inputFor("a.txt", join(dir, "a.txt"), 0)),
    ).toBe(true);
    expect(
      textParser.supports({
        ...inputFor("a.pdf", join(dir, "a.pdf"), 0),
        mime: "application/pdf",
        extension: "pdf",
      }),
    ).toBe(false);
    expect(
      textParser.supports({
        ...inputFor("a.docx", join(dir, "a.docx"), 0),
        mime: "text/plain",
        extension: "docx",
      }),
    ).toBe(false);
  });

  it("respects AbortSignal", async () => {
    const { textParser } = await import("./parsers/text-parser");
    const path = join(dir, "abort.txt");
    writeFileSync(path, "nope");
    const controller = new AbortController();
    controller.abort();
    await expect(
      textParser.parse(inputFor("abort.txt", path, 4), controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
