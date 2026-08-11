import { describe, expect, it } from "vitest";
import { isFenceClosed } from "./stream-fence";

describe("isFenceClosed", () => {
  // @lat: [[rich-content#Streaming fences stay inert]]
  it("treats a closed fence region as closed", () => {
    const source = ["before", "```mermaid", "graph TD", "A-->B", "```", "after"].join(
      "\n",
    );
    const start = source.indexOf("```mermaid");
    const end = source.indexOf("after");
    expect(isFenceClosed(source, start, end)).toBe(true);
  });

  it("detects an unclosed streaming fence", () => {
    const source = ["```mermaid", "graph TD", "A-->B"].join("\n");
    expect(isFenceClosed(source, 0, source.length)).toBe(false);
  });

  it("defaults to closed when offsets are missing", () => {
    expect(isFenceClosed("```mermaid\nA", undefined, undefined)).toBe(true);
  });
});
