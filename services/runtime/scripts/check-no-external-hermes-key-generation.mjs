#!/usr/bin/env node
/**
 * PRD v1.5.3 §97 — External/development Hermes must not auto-generate API_SERVER_KEY.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const file = join(process.cwd(), "src", "services", "secret_service.py");
const text = readFileSync(file, "utf8");

const ensureFn = text.match(/async def ensure_api_server_key[\s\S]*?(?=\n    @|\n    async def |\n    def |\nclass |\Z)/);
if (!ensureFn) {
  console.error("check:no-external-hermes-key-generation FAILED: ensure_api_server_key not found");
  process.exit(1);
}

const body = ensureFn[0];
if (!body.includes("managed_install")) {
  console.error(
    "check:no-external-hermes-key-generation FAILED: ensure_api_server_key must take managed_install",
  );
  process.exit(1);
}
if (!body.includes("HERMES_API_SERVER_KEY_MISSING")) {
  console.error(
    "check:no-external-hermes-key-generation FAILED: external path must raise HERMES_API_SERVER_KEY_MISSING",
  );
  process.exit(1);
}

// token_urlsafe must only appear after managed_install is True
const genIdx = body.indexOf("token_urlsafe");
if (genIdx !== -1) {
  const before = body.slice(0, genIdx);
  if (!/if\s+not\s+managed_install[\s\S]*raise[\s\S]*managed_install/.test(before) && !before.includes("if not managed_install")) {
    // Require that an early return/raise for unmanaged exists before generation
    if (!before.includes("managed_install")) {
      console.error(
        "check:no-external-hermes-key-generation FAILED: token_urlsafe without managed_install gate",
      );
      process.exit(1);
    }
  }
  // Ensure unmanaged path raises before generation
  const unmanagedRaise = before.indexOf("HERMES_API_SERVER_KEY_MISSING");
  if (unmanagedRaise === -1 || unmanagedRaise > genIdx) {
    console.error(
      "check:no-external-hermes-key-generation FAILED: HERMES_API_SERVER_KEY_MISSING must precede token_urlsafe",
    );
    process.exit(1);
  }
}

console.log("check:no-external-hermes-key-generation OK");
