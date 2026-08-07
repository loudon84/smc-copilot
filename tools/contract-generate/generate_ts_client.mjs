#!/usr/bin/env node
/**
 * Generate TypeScript types from contracts/runtime-api/openapi.yaml
 * into packages/runtime-client-ts/src/generated/schema.d.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const OPENAPI = join(ROOT, "contracts/runtime-api/openapi.yaml");
const OUT_DIR = join(ROOT, "packages/runtime-client-ts/src/generated");
const OUT = join(OUT_DIR, "schema.d.ts");

function resolveOpenapiTypescriptBin() {
  const require = createRequire(import.meta.url);
  const candidates = [
    join(ROOT, "packages/runtime-client-ts/node_modules/openapi-typescript/bin/cli.js"),
    join(ROOT, "apps/desktop/node_modules/openapi-typescript/bin/cli.js"),
    join(ROOT, "node_modules/openapi-typescript/bin/cli.js"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  try {
    return require.resolve("openapi-typescript/bin/cli.js");
  } catch {
    throw new Error(
      "openapi-typescript not found. Run: npm install --prefix packages/runtime-client-ts",
    );
  }
}

function main() {
  if (!existsSync(OPENAPI)) {
    throw new Error(`Missing ${OPENAPI}. Run: npm run contracts:generate`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const bin = resolveOpenapiTypescriptBin();
  execFileSync(process.execPath, [bin, OPENAPI, "-o", OUT], {
    cwd: ROOT,
    stdio: "inherit",
  });
  console.log(`[generate_ts_client] wrote packages/runtime-client-ts/src/generated/schema.d.ts`);
}

main();
