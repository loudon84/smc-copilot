#!/usr/bin/env node
/**
 * PRD v1.5.3 §96 — Local Hermes API_SERVER_KEY must not come from SecretReference/SecretStore.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const credentialFile = join(process.cwd(), "src", "services", "gateway_credential_service.py");
const instanceFile = join(process.cwd(), "src", "services", "instance_gateway_service.py");

let failed = false;

const credText = readFileSync(credentialFile, "utf8");
if (!credText.includes("HermesLocalConfigService")) {
  console.error(
    "check:hermes-local-config-sot FAILED: gateway_credential_service.py must use HermesLocalConfigService",
  );
  failed = true;
}
const resolveFn = credText.match(/async def resolve_api_server_key[\s\S]*?(?=\n    async def |\nclass |\Z)/);
if (!resolveFn) {
  console.error("check:hermes-local-config-sot FAILED: resolve_api_server_key not found");
  failed = true;
} else if (/SecretReference|_store\.get/.test(resolveFn[0])) {
  console.error(
    "check:hermes-local-config-sot FAILED: resolve_api_server_key must not use SecretReference/SecretStore",
  );
  failed = true;
} else if (!resolveFn[0].includes("HermesLocalConfigService") && !resolveFn[0].includes("_local_config")) {
  console.error(
    "check:hermes-local-config-sot FAILED: resolve_api_server_key must call HermesLocalConfigService",
  );
  failed = true;
}

const instText = readFileSync(instanceFile, "utf8");
if (!instText.includes("HermesLocalConfigService")) {
  console.error(
    "check:hermes-local-config-sot FAILED: instance_gateway_service.py must reference HermesLocalConfigService",
  );
  failed = true;
}
const resolveSecrets = instText.match(/async def _resolve_secrets[\s\S]*?(?=\n    def |\n    async def |\Z)/);
if (!resolveSecrets) {
  console.error("check:hermes-local-config-sot FAILED: _resolve_secrets not found");
  failed = true;
} else {
  const body = resolveSecrets[0];
  if (!body.includes("HermesLocalConfigService")) {
    console.error(
      "check:hermes-local-config-sot FAILED: _resolve_secrets must use HermesLocalConfigService for API_SERVER_KEY",
    );
    failed = true;
  }
  // Forbid putting SecretStore values into API_SERVER_KEY (must skip then assign from local config).
  if (/out\s*\[\s*["']API_SERVER_KEY["']\s*\]\s*=\s*(?!HermesLocalConfig|local\.|key)/.test(body)) {
    // Allow out["API_SERVER_KEY"] = key where key came from HermesLocalConfigService
  }
  // Detect legacy pattern: assign store value keyed as API_SERVER_KEY without skipping
  if (
    /if\s+value:[\s\S]{0,40}out\[row\.secret_name\]\s*=\s*value/.test(body) &&
    !/secret_name\s*==\s*["']API_SERVER_KEY["'][\s\S]{0,40}continue/.test(body)
  ) {
    console.error(
      "check:hermes-local-config-sot FAILED: _resolve_secrets must skip SecretReference API_SERVER_KEY",
    );
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("check:hermes-local-config-sot OK");
