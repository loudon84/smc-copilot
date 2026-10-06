import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !name.includes(".test.")) {
      acc.push(full);
    }
  }
  return acc;
}

const SECRET_RE =
  /accessToken|access_token|refreshToken|refresh_token|Authorization\s*:|Bearer\s+[A-Za-z0-9._\-]+/i;
const INTERNAL_RE = /\/internal\/|nodeskclaw-agent:|remote-hermes:\/\//i;

describe("Remote Expert security source scan", () => {
  it("[A-NEG-SEC-CLOSURE-001] renderer/preload remote-expert sources have no token material", () => {
    const roots = [
      join(__dirname),
      join(__dirname, "../../../../preload"),
    ];
    const files = roots.flatMap((root) => walk(root));
    const hits: string[] = [];
    for (const file of files) {
      if (!file.includes("remote-expert") && !file.includes("remote-expert-api")) {
        continue;
      }
      const text = readFileSync(file, "utf8");
      if (SECRET_RE.test(text)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });

  it("[A-NEG-SEC-CLOSURE-002] main remote-expert has no internal agent/Hermes URLs", () => {
    const root = join(__dirname, "../../../../main/remote-expert");
    const files = walk(root);
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (INTERNAL_RE.test(text)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });
});
