import { describe, expect, it } from "vitest";
import {
  buildCombinedArtifactHtml,
  combineArtifactFences,
  extractArtifactFences,
} from "./artifact-source-parser";

describe("artifact-source-parser", () => {
  // @lat: [[rich-content#Artifact AST combiner]]
  it("combines html/css/js fences into one document with CSP", () => {
    const html = combineArtifactFences({
      html: "<h1>Hi</h1>",
      css: "h1{color:red}",
      js: "console.log(1)",
    });
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("<h1>Hi</h1>");
    expect(html).toContain("h1{color:red}");
    expect(html).toContain("console.log(1)");
  });

  it("extracts fences from markdown source", () => {
    const source = [
      "```html",
      "<p>x</p>",
      "```",
      "```css",
      "p{color:blue}",
      "```",
      "```js",
      "void 0",
      "```",
    ].join("\n");
    const parts = extractArtifactFences(source);
    expect(parts.html).toContain("<p>x</p>");
    expect(parts.css).toContain("color:blue");
    expect(parts.js).toContain("void 0");
    const combined = buildCombinedArtifactHtml(source);
    expect(combined).toContain("Content-Security-Policy");
  });
});
