#!/usr/bin/env node
/**
 * PRD REQ-MUI-004: Kit imports stay on allowlisted Knowledge golden pages.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const ERROR = "BUSINESS_MODULE_UI_BOUNDARY_VIOLATION";

const KIT_ALIAS = [
  /^@\/components\/ui(?:\/|$)/,
  /^@\/components\/common(?:\/|$)/,
  /^@\/components\/knowledge\/knowledge-base-card$/,
  /^@\/utils(?:\/|$)/,
  /^@\/hooks(?:\/|$)/,
];

const KIT_DIRS = [
  resolve(ROOT, "components/ui"),
  resolve(ROOT, "components/common"),
];
const KIT_FILES = [resolve(ROOT, "components/knowledge/knowledge-base-card.tsx")];

const FORBID_UNUSED = [
  "components/knowledge/citation-card",
  "components/knowledge/document-table",
  "components/knowledge/document-status-badge",
  "components/knowledge/knowledge-set-card",
  "components/knowledge/permission-badge",
  "components/knowledge/upload-status-badge",
  "components/layout/",
];

const ALLOW_KIT = new Set([
  "components/knowledge/knowledge-base-card.tsx",
  "src/renderer/src/screens/Knowledge/pages/KnowledgeBasesPage.tsx",
  "src/renderer/src/screens/Knowledge/pages/KnowledgeBaseDetailPage.tsx",
  "src/renderer/src/screens/Knowledge/pages/KnowledgeDocumentsPage.tsx",
  "src/renderer/src/screens/Knowledge/pages/KnowledgeDocumentDetailPage.tsx",
]);

const ALLOW_KIT_PREFIX = [
  "components/ui/",
  "components/common/",
  "src/renderer/src/screens/Knowledge/features/bases/",
  "src/renderer/src/screens/Knowledge/features/file-job/",
];

const SKIP_SCAN_PREFIX = [
  "components/layout/",
  "components/knowledge/citation-card",
  "components/knowledge/document-table",
  "components/knowledge/document-status-badge",
  "components/knowledge/knowledge-set-card",
  "components/knowledge/permission-badge",
  "components/knowledge/upload-status-badge",
];

const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/** @type {string[]} */
const hits = [];

function rel(full) {
  return relative(ROOT, full).replace(/\\/g, "/");
}

function walk(dir) {
  /** @type {string[]} */
  const files = [];
  if (!dir) return files;
  for (const name of readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === "dist" ||
      name === "out" ||
      name === "references" ||
      name === "wiki"
    ) {
      continue;
    }
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function isCode(path) {
  return CODE_EXT.has(extname(path).toLowerCase());
}

function allowKit(pathRel) {
  if (ALLOW_KIT.has(pathRel)) return true;
  return ALLOW_KIT_PREFIX.some((prefix) => pathRel.startsWith(prefix));
}

function skipVendorUnused(pathRel) {
  return SKIP_SCAN_PREFIX.some((prefix) => pathRel.startsWith(prefix));
}

function underDir(resolved, dir) {
  const prefix = dir.endsWith("\\") || dir.endsWith("/") ? dir : `${dir}\\`;
  const posixPrefix = `${dir.replace(/\\/g, "/")}/`;
  const norm = resolved.replace(/\\/g, "/");
  return norm === dir.replace(/\\/g, "/") || norm.startsWith(posixPrefix) || resolved.startsWith(prefix);
}

function isKitSpecifier(fromFile, specifier) {
  if (KIT_ALIAS.some((re) => re.test(specifier))) return true;
  if (specifier.includes("apps/work/components")) return true;
  if (!(specifier.startsWith(".") || specifier.startsWith("/"))) return false;
  const resolved = resolve(dirname(fromFile), specifier);
  if (KIT_FILES.some((file) => resolved === file || resolved.startsWith(`${file}`))) {
    return true;
  }
  return KIT_DIRS.some((dir) => underDir(resolved, dir));
}

function specifiers(text) {
  const found = [];
  IMPORT_RE.lastIndex = 0;
  let match = IMPORT_RE.exec(text);
  while (match) {
    const spec = match[1] || match[2];
    if (spec) found.push(spec);
    match = IMPORT_RE.exec(text);
  }
  return found;
}

function scan(full) {
  const pathRel = rel(full);
  if (!isCode(full)) return;
  if (pathRel.startsWith("scripts/")) return;
  if (skipVendorUnused(pathRel)) return;
  const text = readFileSync(full, "utf8");

  if (/@tanstack\/react-router/.test(text)) {
    hits.push(`${pathRel}: @tanstack/react-router`);
  }

  for (const forbidden of FORBID_UNUSED) {
    if (text.includes(forbidden)) {
      hits.push(`${pathRel}: import ${forbidden}`);
    }
  }

  if (allowKit(pathRel)) return;

  for (const spec of specifiers(text)) {
    if (isKitSpecifier(full, spec)) {
      hits.push(`${pathRel}: Kit import outside allowlist`);
      break;
    }
  }
}

const probe = process.argv.includes("--probe")
  ? process.argv[process.argv.indexOf("--probe") + 1]
  : "";

for (const file of walk(join(ROOT, "src"))) scan(file);
for (const file of walk(join(ROOT, "components/ui"))) scan(file);
for (const file of walk(join(ROOT, "components/common"))) scan(file);
scan(join(ROOT, "components/knowledge/knowledge-base-card.tsx"));
if (probe) scan(resolve(ROOT, probe));

if (hits.length > 0) {
  console.error(`${ERROR}\n${hits.map((h) => `  - ${h}`).join("\n")}`);
  process.exit(1);
}

console.log("[check:business-module-ui-boundary] OK");
