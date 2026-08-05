// @vitest-environment node
import { describe, expect, it } from "vitest";
import { chunkText } from "./file-chunking";

describe("chunkText structure-aware", () => {
  // @lat: [[session-file-context#FTS chunking]]
  it("splits on markdown headings before hard char limit", () => {
    const a = "A".repeat(100);
    const b = "B".repeat(100);
    const text = `# Title One\n${a}\n# Title Two\n${b}`;
    const chunks = chunkText(text, 150, 10);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((c) => c.includes("Title Two"))).toBe(true);
  });

  it("falls back to fixed windows for unbroken text", () => {
    const text = "x".repeat(500);
    const chunks = chunkText(text, 200, 20);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBeLessThanOrEqual(200);
  });

  it("returns empty for empty input", () => {
    expect(chunkText("", 100, 10)).toEqual([]);
  });
});
