#!/usr/bin/env node
/**
 * Fail CI when OpenAPI-derived schema.d.ts has drifted from the committed file.
 * Regenerates into a temp file from the committed snapshot and diffs.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const OUT_DIR = join(ROOT, "src/shared/generated/copilot-serve");
const SNAPSHOT = join(OUT_DIR, "openapi.snapshot.json");
const SCHEMA = join(OUT_DIR, "schema.d.ts");

function normalize(text) {
  return text.replace(/\r\n/g, "\n").trimEnd() + "\n";
}

function main() {
  if (!existsSync(SNAPSHOT)) {
    console.error(`[serve-client] missing snapshot: ${SNAPSHOT}`);
    process.exit(1);
  }
  if (!existsSync(SCHEMA)) {
    console.error(`[serve-client] missing schema: ${SCHEMA}`);
    console.error("Run: npm run generate:serve-client");
    process.exit(1);
  }

  const bin = join(ROOT, "node_modules/openapi-typescript/bin/cli.js");
  if (!existsSync(bin)) {
    console.error("openapi-typescript is not installed");
    process.exit(1);
  }

  const tempDir = mkdtempSync(join(tmpdir(), "serve-client-drift-"));
  const tempSchema = join(tempDir, "schema.d.ts");
  try {
    execFileSync(process.execPath, [bin, SNAPSHOT, "-o", tempSchema], {
      cwd: ROOT,
      stdio: "pipe",
    });
    const expected = normalize(readFileSync(tempSchema, "utf8"));
    const actual = normalize(readFileSync(SCHEMA, "utf8"));
    if (expected !== actual) {
      console.error("[serve-client] schema.d.ts drifted from openapi.snapshot.json");
      console.error("Run: npm run generate:serve-client");
      process.exit(1);
    }
    console.log("[serve-client] contract drift check passed");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
