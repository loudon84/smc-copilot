import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../../..");
const CONTEXT_DIRS = [
  "src/main/remote-expert-acp",
  "src/shared/remote-expert-acp",
  "src/preload/remote-expert-api.ts",
  "src/renderer/src/screens/Chat/remote-expert",
];

const FORBIDDEN = [
  "WORK-EXPERT-CONTRACT",
  "ExpertProjectionStore",
  "expert.start",
  "SkillRunStore",
  "../expert/",
  "../skill-run/",
  "modules/expert",
  "preload/expert-api",
  "shared/expert",
  'from "../expert/',
  'from "../../expert/',
  'from "../skill-run/',
];

function walk(path: string, acc: string[] = []): string[] {
  const st = statSync(path);
  if (st.isFile()) {
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      if (!path.endsWith(".test.ts") && !path.endsWith(".test.tsx")) acc.push(path);
    }
    return acc;
  }
  if (!st.isDirectory()) return acc;
  for (const entry of readdirSync(path)) {
    walk(join(path, entry), acc);
  }
  return acc;
}

describe("remote-expert-acp isolation", () => {
  it("does not import forbidden legacy Expert or Skill Run execution modules", () => {
    const files = CONTEXT_DIRS.flatMap((rel) => walk(join(ROOT, rel)));
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const token of FORBIDDEN) {
        if (text.includes(token)) {
          hits.push(`${file}: ${token}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("keeps Chat remote submit off the legacy expert.start / skillRun.start path", () => {
    const chat = readFileSync(join(ROOT, "src/renderer/src/screens/Chat/Chat.tsx"), "utf8");
    const start = chat.indexOf("remoteExpertEnabled &&");
    const submit = chat.indexOf("remoteExpert", start);
    const end = chat.indexOf("return;", chat.indexOf(".submit({", submit));
    const slice = chat.slice(start, end);
    expect(slice).toContain(".submit({");
    expect(slice).not.toContain("submitExpert");
    expect(slice).not.toContain("expert.start");
    expect(slice).not.toContain("skillRun.start");
  });
});
