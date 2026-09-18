import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as Framework from "./index";

describe("AC-001 FilePreview Framework package", () => {
  it("exports FilePreview and source types from components/file-preview", () => {
    expect(typeof Framework.FilePreview).toBe("function");
    expect(typeof Framework.createKnowledgeFileProvider).toBe("function");
    expect(typeof Framework.createLocalFileProvider).toBe("function");
    expect(typeof Framework.createHttpFileProvider).toBe("function");
    expect(
      existsSync(resolve(__dirname, "adapters/open-file-viewer.tsx")),
    ).toBe(true);
  });
});
