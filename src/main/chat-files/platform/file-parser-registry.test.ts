// @vitest-environment node
import { describe, expect, it, beforeEach } from "vitest";
import type { FileParser, FileParserInput } from "../../../shared/files";
import {
  FileParserRegistry,
  getDefaultParserRegistry,
  resetDefaultParserRegistry,
} from "./file-parser-registry";
import { fallbackParser } from "./parsers/fallback-parser";

function makeInput(partial: Partial<FileParserInput>): FileParserInput {
  return {
    fileId: "f1",
    path: "/tmp/x",
    name: "file.txt",
    extension: "txt",
    mime: "text/plain",
    size: 10,
    ...partial,
  };
}

function stubParser(
  id: string,
  priority: number,
  supports: (input: FileParserInput) => boolean,
): FileParser {
  return {
    id,
    version: 1,
    priority,
    supports,
    async parse(input) {
      return {
        fileId: input.fileId,
        parserId: id,
        parserVersion: 1,
        text: id,
        sections: [],
        metadata: {},
        truncated: false,
        parsedAt: new Date().toISOString(),
      };
    },
  };
}

describe("FileParserRegistry", () => {
  beforeEach(() => {
    resetDefaultParserRegistry();
  });

  it("picks the highest-priority supporting parser", () => {
    const registry = new FileParserRegistry();
    registry.register(
      stubParser("low", 10, (i) => i.extension === "txt"),
    );
    registry.register(
      stubParser("high", 100, (i) => i.extension === "txt"),
    );
    registry.register(fallbackParser);

    const resolved = registry.resolve(makeInput({ extension: "txt" }));
    expect(resolved.id).toBe("high");
  });

  it("forces fallback for denied extensions", () => {
    const registry = getDefaultParserRegistry();
    const resolved = registry.resolve(
      makeInput({
        name: "malware.exe",
        extension: "exe",
        mime: "application/octet-stream",
      }),
    );
    expect(resolved.id).toBe("fallback");
  });

  it("resolves markdown over generic text for .md", () => {
    const registry = getDefaultParserRegistry();
    const resolved = registry.resolve(
      makeInput({
        name: "notes.md",
        extension: "md",
        mime: "text/markdown",
      }),
    );
    expect(resolved.id).toBe("markdown");
  });

  it("resolves code for .ts", () => {
    const registry = getDefaultParserRegistry();
    const resolved = registry.resolve(
      makeInput({
        name: "app.ts",
        extension: "ts",
        mime: "text/plain",
      }),
    );
    expect(resolved.id).toBe("code");
  });

  it("resolves office/pdf/epub by extension", () => {
    const registry = getDefaultParserRegistry();
    // Defaults select MarkItDown for office/pdf (priority over coarse parsers).
    expect(
      registry.resolve(
        makeInput({
          name: "a.docx",
          extension: "docx",
          mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ).id,
    ).toBe("markitdown");
    expect(
      registry.resolve(
        makeInput({
          name: "a.pdf",
          extension: "pdf",
          mime: "application/pdf",
        }),
      ).id,
    ).toBe("markitdown");
    expect(
      registry.resolve(
        makeInput({
          name: "a.epub",
          extension: "epub",
          mime: "application/epub+zip",
        }),
      ).id,
    ).toBe("epub");
  });

  it("lists descriptors sorted by priority desc", () => {
    const registry = getDefaultParserRegistry();
    const list = registry.list();
    expect(list.length).toBeGreaterThan(3);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].priority).toBeGreaterThanOrEqual(list[i].priority);
    }
    expect(list[list.length - 1].id).toBe("fallback");
  });

  it("falls back when nothing else matches", () => {
    const registry = getDefaultParserRegistry();
    const resolved = registry.resolve(
      makeInput({
        name: "blob.unknownxyz",
        extension: "unknownxyz",
        mime: "application/octet-stream",
      }),
    );
    expect(resolved.id).toBe("fallback");
  });
});
