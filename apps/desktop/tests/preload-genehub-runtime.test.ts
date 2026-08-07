import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("preload genehubRuntime exposure", () => {
  it("exposes genehubRuntime in contextIsolation branch", () => {
    const source = readFileSync(resolve("src/preload/index.ts"), "utf8");
    expect(source).toContain(
      'contextBridge.exposeInMainWorld("genehubRuntime", genehubRuntimeApi)',
    );
    expect(source).toContain("window.genehubRuntime = genehubRuntimeApi");
  });

  it("exposes v6.7.1 MCP registration IPC wrappers", () => {
    const source = readFileSync(resolve("src/preload/genehub-runtime-api.ts"), "utf8");
    expect(source).toContain("genehub:list-mcp-registration-jobs");
    expect(source).toContain("genehub:preview-install-bundle");
    expect(source).toContain("genehub:ignore-install-job");
    expect(source).toContain("genehub:get-registration-summary");
    expect(source).toContain("genehub:install-job");
    expect(source).toContain("userConfirmed");
    expect(source).toContain("onPendingJobsChanged");
  });
});
