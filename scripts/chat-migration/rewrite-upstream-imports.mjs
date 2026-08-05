#!/usr/bin/env node
/**
 * Rewrite chat-files/platform imports so they resolve under
 * src/main/chat-files/platform/ (original paths assumed src/main/).
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "../..");
const ROOT = join(REPO, "src/main/chat-files/platform");
const MAIN = join(REPO, "src/main");
const SHARED = join(REPO, "src/shared");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function relImport(fromFile, targetAbs) {
  let rel = relative(dirname(fromFile), targetAbs).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel.replace(/\.tsx?$/, "");
}

const SIBLINGS = [
  "session-context-folder-store",
  "session-attachment-store",
  "session-model-override-store",
  "file-store",
  "file-security",
  "file-config",
  "file-association-store",
  "file-parse-service",
  "file-chunking",
  "file-metadata",
  "file-import-service",
  "file-preview-service",
  "file-index-service",
  "file-operation-service",
  "file-cleanup-service",
  "file-context-builder",
  "file-parser-registry",
  "file-domain-events",
  "file-category",
  "file-path-policy",
  "attachment-adapter",
  "attachment-staging",
  "compose-wire-session-context",
  "load-managed-message-attachments",
  "persist-managed-message-associations",
];

const siblingRe = new RegExp(
  `from ["']\\.\\./(${SIBLINGS.join("|")})["']`,
  "g",
);

const files = walk(ROOT);
let changed = 0;
for (const file of files) {
  let text = readFileSync(file, "utf8");
  const orig = text;

  text = text.replace(
    /from ["'](\.\.\/)+(utils|config|db|attachment-staging)["']/g,
    (_m, _dots, mod) => {
      if (mod === "attachment-staging") {
        return `from "${relImport(file, join(ROOT, "attachment-staging.ts"))}"`;
      }
      const abs = join(MAIN, `${mod}.ts`);
      if (!existsSync(abs) && mod === "db") {
        // some code expects main/db.ts â€?leave path anyway
      }
      return `from "${relImport(file, abs)}"`;
    },
  );

  text = text.replace(
    /from ["']((?:\.\.\/)+)shared\/([^"']+)["']/g,
    (_m, _dots, rest) => {
      const abs = join(SHARED, rest);
      return `from "${relImport(file, abs)}"`;
    },
  );

  text = text.replace(siblingRe, (_m, mod) => {
    const target = join(ROOT, `${mod}.ts`);
    return `from "${relImport(file, target)}"`;
  });

  if (text !== orig) {
    writeFileSync(file, text);
    changed += 1;
  }
}

console.log(`rewrote ${changed} of ${files.length} files`);
