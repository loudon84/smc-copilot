#!/usr/bin/env node
/**
 * PRD v1.5.4 §H — Instance chat model catalog must not use Gateway /v1/models as SOT.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const catalog = join(
  process.cwd(),
  "src",
  "services",
  "hermes_model_catalog_service.py",
);
const instanceChat = join(
  process.cwd(),
  "src",
  "services",
  "instance_chat_service.py",
);
const executor = join(
  process.cwd(),
  "src",
  "services",
  "hermes_chat_executor.py",
);

let failed = false;

const catalogText = readFileSync(catalog, "utf8");
if (!catalogText.includes("list_model_options") || !catalogText.includes("normalize_model_options")) {
  console.error(
    "check:model-catalog-sot FAILED: hermes_model_catalog_service must normalize /api/model/options",
  );
  failed = true;
}
if (!catalogText.includes("HermesLocalConfigService") && !catalogText.includes("resolve_default_model")) {
  console.error(
    "check:model-catalog-sot FAILED: default model must resolve from Hermes config SOT",
  );
  failed = true;
}

const chatText = readFileSync(instanceChat, "utf8");
if (!chatText.includes("HermesModelCatalogService")) {
  console.error(
    "check:model-catalog-sot FAILED: instance_chat_service must use HermesModelCatalogService",
  );
  failed = true;
}

// ensure_default_model_config must not seed from client.list_models() (/v1/models).
const ensureFn = chatText.match(
  /async def ensure_default_model_config[\s\S]*?(?=\n    async def |\n    def |\Z)/,
);
if (!ensureFn) {
  console.error("check:model-catalog-sot FAILED: ensure_default_model_config not found");
  failed = true;
} else {
  const body = ensureFn[0];
  if (/await\s+client\.list_models\s*\(/.test(body)) {
    console.error(
      "check:model-catalog-sot FAILED: ensure_default_model_config must not seed from client.list_models()",
    );
    failed = true;
  }
  if (!body.includes("resolve_default_model") && !body.includes("_catalog()")) {
    console.error(
      "check:model-catalog-sot FAILED: ensure_default_model_config must use catalog/config.yaml SOT",
    );
    failed = true;
  }
}

const listFn = chatText.match(
  /async def list_models[\s\S]*?(?=\n    async def |\n    def |\Z)/,
);
if (!listFn) {
  console.error("check:model-catalog-sot FAILED: list_models not found");
  failed = true;
} else if (/await\s+client\.list_models\s*\(/.test(listFn[0])) {
  console.error(
    "check:model-catalog-sot FAILED: list_models must not call Gateway client.list_models() for catalog",
  );
  failed = true;
} else if (!listFn[0].includes("build_catalog") && !listFn[0].includes("_catalog")) {
  console.error(
    "check:model-catalog-sot FAILED: list_models must use HermesModelCatalogService.build_catalog",
  );
  failed = true;
}

// Chat execution path must not resolve model from Gateway /v1/models.
const executorText = readFileSync(executor, "utf8");
const resolveFn = executorText.match(
  /async def resolve_default_model[\s\S]*?(?=\n    async def |\n    def |\Z)/,
);
if (!resolveFn) {
  console.error(
    "check:model-catalog-sot FAILED: HermesChatExecutor.resolve_default_model not found",
  );
  failed = true;
} else {
  const body = resolveFn[0];
  if (/await\s+client\.list_models\s*\(/.test(body)) {
    console.error(
      "check:model-catalog-sot FAILED: HermesChatExecutor.resolve_default_model must not use client.list_models()",
    );
    failed = true;
  }
  if (!body.includes("HermesModelCatalogService") && !body.includes("_catalog")) {
    console.error(
      "check:model-catalog-sot FAILED: HermesChatExecutor.resolve_default_model must use catalog/config.yaml SOT",
    );
    failed = true;
  }
  if (!body.includes("is_gateway_virtual_model_id") && !body.includes("GATEWAY_VIRTUAL_MODEL")) {
    console.error(
      "check:model-catalog-sot FAILED: HermesChatExecutor must filter Gateway virtual model ids",
    );
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("check:model-catalog-sot OK");
