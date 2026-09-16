import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const uiDir = join(__dirname);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return [path];
  });
}

describe("Work UI prefix", () => {
  it("production ui files only expose .ui-* class names", () => {
    const files = walk(uiDir).filter(
      (path) =>
        /\.(tsx|css)$/.test(path) && !path.includes(".test."),
    );
    const other = new Set<string>();
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/class(Name)?=["'`]([^"'`]+)["'`]/g)) {
        for (const token of match[2].split(/\s+/)) {
          if (!token || token.startsWith("ui-") || token.includes("${") || token.includes("ui-")) {
            continue;
          }
          if (/^[A-Z]/.test(token) || token === "true" || token === "false") continue;
          other.add(`${file}:${token}`);
        }
      }
      for (const match of text.matchAll(/\.([a-z][a-z0-9_-]*)/g)) {
        const cls = match[1];
        if (
          cls.startsWith("ui-") ||
          ["filter", "join", "split", "test", "tsx", "css"].includes(cls)
        ) {
          continue;
        }
        if (file.endsWith(".css") && !cls.startsWith("ui-")) {
          other.add(`${file}:.${cls}`);
        }
      }
    }
    expect([...other]).toEqual([]);
  });
});
