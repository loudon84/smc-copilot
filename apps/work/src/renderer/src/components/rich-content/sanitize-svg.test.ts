import { describe, expect, it } from "vitest";
import { sanitizeSvg } from "./sanitize-svg";

describe("sanitizeSvg", () => {
  // @lat: [[rich-content#SVG sanitize strips scripts]]
  it("strips script tags and event handlers", () => {
    const dirty = `
<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">
  <script>alert(1)</script>
  <circle cx="5" cy="5" r="4" onclick="alert(2)" onload="evil()"/>
  <a href="javascript:alert(3)"><text>x</text></a>
</svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toBeNull();
    expect(clean!.toLowerCase()).not.toContain("<script");
    expect(clean!.toLowerCase()).not.toContain("onclick");
    expect(clean!.toLowerCase()).not.toContain("onload");
    expect(clean!.toLowerCase()).not.toContain("javascript:");
  });

  it("returns null for empty or non-svg input", () => {
    expect(sanitizeSvg("")).toBeNull();
    expect(sanitizeSvg("just text")).toBeNull();
  });

  it("strips external href references", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toBeNull();
    expect(clean!).not.toContain("evil.example");
    expect(clean!).not.toMatch(/\shref\s*=\s*["']https?:/i);
  });
});
