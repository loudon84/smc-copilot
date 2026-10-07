import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "fs";
import { join, relative } from "path";
import { tmpdir } from "os";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(__dirname, "../../src");

const FORBIDDEN = [
  "WORK-EXPERT-CONTRACT",
  "WORK_EXPERT_CONTRACT",
  "expert.start",
  "/api/v1/expert/mcp",
  "/api/v1/remote-agent",
  "hermes/artifacts",
  "nodeskclaw-acp",
  "acpAdapter",
  "/internal/",
];

const SKILL_NAME_ALLOWED = new Set([
  join("shared", "remote-expert.ts").replaceAll("\\", "/"),
  join("main", "skills.ts").replaceAll("\\", "/"),
]);

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "out") continue;
      walk(full, files);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    files.push(full);
  }
  return files;
}

export function scanForbiddenHits(
  root: string,
  extraFiles: string[] = [],
): Array<{ file: string; needle: string; line: number }> {
  const hits: Array<{ file: string; needle: string; line: number }> = [];
  const files = [...walk(root), ...extraFiles];
  for (const file of files) {
    const rel = relative(root, file).replaceAll("\\", "/");
    const text = readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const needle of FORBIDDEN) {
        if (line.includes(needle)) {
          hits.push({ file: rel, needle, line: index + 1 });
        }
      }
      if (line.includes("skillName") && !SKILL_NAME_ALLOWED.has(rel)) {
        hits.push({ file: rel, needle: "skillName", line: index + 1 });
      }
    });
  }
  return hits;
}

describe("remote-expert migration gate", () => {
  it("[A-MIGRATE-001] [A-MIG-2101] production source has zero forbidden legacy Remote Expert / Work Expert hits", () => {
    const hits = scanForbiddenHits(SRC_ROOT);
    expect(hits).toEqual([]);
  });

  it("[A-NEG-MIGRATE-001] counts an implanted forbidden token as a hit", () => {
    const dir = mkdtempSync(join(tmpdir(), "remote-expert-gate-"));
    const implant = join(dir, "implant.ts");
    writeFileSync(
      implant,
      'const bad = "nodeskclaw-acp.exe";\nvoid window.hermesAPI.expert.start;\n',
      "utf8",
    );
    try {
      const hits = scanForbiddenHits(SRC_ROOT, [implant]);
      expect(hits.some((hit) => hit.needle === "nodeskclaw-acp")).toBe(true);
      expect(hits.some((hit) => hit.needle === "expert.start")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
