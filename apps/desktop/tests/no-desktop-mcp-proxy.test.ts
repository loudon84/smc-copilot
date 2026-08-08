/**
 * PRD v1.4.1 — Desktop must not start local MCP Agent proxy (:18781).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// @lat: [[serve-runtime-tests#v1.4.1 Hotfix guards#No desktop mcp proxy on 18781]]

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "out" || name === "dist") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkTsFiles(full, out);
    else if (/\.(ts|tsx|js|cjs|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

describe("no desktop mcp proxy (PRD v1.4.1)", () => {
  it("production src must not start MCP runtime proxy or bind 18781", () => {
    const root = join(__dirname, "../src");
    const files = walkTsFiles(root);
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (
        text.includes("startMcpRuntimeProxy") ||
        text.includes("mcp-runtime-proxy") ||
        /[^0-9]18781[^0-9]/.test(text) ||
        text.includes(":18781")
      ) {
        offenders.push(file.replace(/\\/g, "/"));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("registers compatibility adapter instead of local MCP registry", () => {
    const indexSrc = readFileSync(join(__dirname, "../src/main/index.ts"), "utf8");
    expect(indexSrc).toMatch(/registerMcpCompatIpc/);
    expect(indexSrc).not.toMatch(/registerMcpIpc\(/);
    expect(indexSrc).not.toMatch(/seedDefaultMcpServers/);
    expect(indexSrc).not.toMatch(/stopMcpRuntimeProxy/);
  });
});
