#!/usr/bin/env node
/**
 * Generate typed Serve OpenAPI client types.
 *
 * Source order:
 * 1. COPILOT_SERVE_OPENAPI_URL env
 * 2. http://127.0.0.1:8765/openapi.json (live Serve)
 * 3. committed snapshot at src/shared/generated/copilot-serve/openapi.snapshot.json
 *
 * Emits: src/shared/generated/copilot-serve/schema.d.ts
 * Refresh snapshot when fetched live.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const OUT_DIR = join(ROOT, "src/shared/generated/copilot-serve");
const SNAPSHOT = join(OUT_DIR, "openapi.snapshot.json");
const SCHEMA = join(OUT_DIR, "schema.d.ts");
const DEFAULT_LIVE = "http://127.0.0.1:8765/openapi.json";

async function fetchOpenApi(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeJson(text) {
  const parsed = JSON.parse(text);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

async function resolveOpenApiDocument() {
  const envUrl = process.env.COPILOT_SERVE_OPENAPI_URL?.trim();
  const candidates = [];
  if (envUrl) candidates.push({ kind: "env", url: envUrl });
  candidates.push({ kind: "live", url: DEFAULT_LIVE });

  for (const candidate of candidates) {
    try {
      const raw = await fetchOpenApi(candidate.url);
      const normalized = normalizeJson(raw);
      console.log(`[serve-client] fetched OpenAPI from ${candidate.kind}: ${candidate.url}`);
      return { source: candidate.kind, document: normalized, refreshSnapshot: true };
    } catch (err) {
      console.warn(
        `[serve-client] ${candidate.kind} fetch failed (${candidate.url}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (!existsSync(SNAPSHOT)) {
    throw new Error(
      `No OpenAPI source available. Start Serve on :8765 or provide COPILOT_SERVE_OPENAPI_URL, or commit ${SNAPSHOT}`,
    );
  }
  const document = readFileSync(SNAPSHOT, "utf8");
  console.log(`[serve-client] using committed snapshot: ${SNAPSHOT}`);
  return { source: "snapshot", document, refreshSnapshot: false };
}

function runOpenapiTypescript(inputPath, outputPath) {
  const bin = join(ROOT, "node_modules/openapi-typescript/bin/cli.js");
  if (!existsSync(bin)) {
    throw new Error("openapi-typescript is not installed. Run: npm install --save-dev openapi-typescript");
  }
  execFileSync(process.execPath, [bin, inputPath, "-o", outputPath], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const { document, refreshSnapshot } = await resolveOpenApiDocument();

  if (refreshSnapshot) {
    writeFileSync(SNAPSHOT, document, "utf8");
    console.log(`[serve-client] refreshed snapshot → ${SNAPSHOT}`);
  }

  // Always write a working input file (snapshot) then generate types from it.
  if (!existsSync(SNAPSHOT)) {
    writeFileSync(SNAPSHOT, document, "utf8");
  }

  runOpenapiTypescript(SNAPSHOT, SCHEMA);
  console.log(`[serve-client] generated → ${SCHEMA}`);
}

main().catch((err) => {
  console.error("[serve-client] generate failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
