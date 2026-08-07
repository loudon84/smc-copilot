// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  extractDocumentTitle,
  isDocumentLikeMessage,
} from "./document-message-utils";

describe("document-message-utils", () => {
  it("rejects short messages", () => {
    expect(isDocumentLikeMessage("hi")).toBe(false);
  });

  it("accepts long messages with headings", () => {
    const body = `# Report\n\n${"paragraph ".repeat(40)}\n\n## Section\n\nMore text here that makes this long enough.`;
    expect(isDocumentLikeMessage(body)).toBe(true);
  });

  it("accepts markdown tables even without many paragraphs", () => {
    const table = [
      "# Title",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "x".repeat(280),
    ].join("\n");
    expect(isDocumentLikeMessage(table)).toBe(true);
  });

  it("accepts four-plus paragraphs without headings", () => {
    const body = [
      "p1 ".repeat(40),
      "p2 ".repeat(40),
      "p3 ".repeat(40),
      "p4 ".repeat(40),
    ].join("\n\n");
    expect(body.length).toBeGreaterThanOrEqual(300);
    expect(isDocumentLikeMessage(body)).toBe(true);
  });

  it("extracts title from heading", () => {
    expect(extractDocumentTitle("# 客户画像报告\n\nbody")).toBe("客户画像报告");
  });

  it("prefers suggested title", () => {
    expect(
      extractDocumentTitle("# Heading\n\nbody", "Suggested Title"),
    ).toBe("Suggested Title");
  });

  it("falls back to session title then generated-report", () => {
    expect(extractDocumentTitle("no heading", undefined, "Session")).toBe(
      "Session",
    );
    expect(extractDocumentTitle("no heading")).toBe("generated-report");
  });
});
