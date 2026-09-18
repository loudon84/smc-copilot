import { describe, expect, it } from "vitest";
import { detectFormat, extensionOf } from "./file-detector";
import { capabilityFor, isPreviewable } from "./preview-registry";

describe("file-detector", () => {
  it("maps common extensions to formats", () => {
    expect(detectFormat({ name: "a.md" })).toBe("markdown");
    expect(detectFormat({ name: "a.PDF" })).toBe("pdf");
    expect(detectFormat({ name: "pic.png" })).toBe("image");
    expect(detectFormat({ name: "x.docx" })).toBe("docx");
    expect(detectFormat({ name: "x.json" })).toBe("json");
    expect(detectFormat({ name: "x.ts" })).toBe("code");
  });

  it("prefers mime when present", () => {
    expect(detectFormat({ name: "a.bin", mime: "application/pdf" })).toBe(
      "pdf",
    );
    expect(detectFormat({ name: "a.bin", mime: "image/png" })).toBe("image");
  });

  it("returns unsupported for unknown", () => {
    expect(detectFormat({ name: "a.xyz" })).toBe("unsupported");
    expect(extensionOf("path/to/Report.MD")).toBe("md");
  });
});

describe("preview-registry", () => {
  it("marks FP-001 must/should formats previewable", () => {
    expect(capabilityFor("markdown")).toBe("must");
    expect(capabilityFor("docx")).toBe("should");
    expect(isPreviewable("pdf")).toBe(true);
    expect(isPreviewable("unsupported")).toBe(false);
  });
});
