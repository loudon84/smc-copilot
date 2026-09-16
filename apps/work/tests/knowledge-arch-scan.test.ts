import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../src/renderer/src/screens/Knowledge");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("A-ARCH-001 Knowledge pages/features", () => {
  it("does not hardcode the Knowledge service URL or fetch from the renderer", () => {
    const files = walk(ROOT);
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toContain("127.0.0.1:4580");
      expect(text).not.toContain("localhost:4530");
      expect(text).not.toMatch(/\bfetch\s*\(/);
    }
  });
});
