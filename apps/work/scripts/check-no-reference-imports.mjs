#!/usr/bin/env node
/**
 * PRD §2.1 / §24: product `src/` must never import Chatbox reference trees.
 * Fails CI if references/chatbox or wiki/wiki_chatbox appear under src/.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const FORBIDDEN = [/references\/chatbox/i, /wiki\/wiki_chatbox/i];
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/** @type {string[]} */
const hits = [];

/**
 * @param {string} dir
 */
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    const lower = name.toLowerCase();
    const dot = lower.lastIndexOf(".");
    const ext = dot >= 0 ? lower.slice(dot) : "";
    if (!CODE_EXT.has(ext)) continue;
    const text = readFileSync(full, "utf8");
    for (const re of FORBIDDEN) {
      if (re.test(text)) {
        hits.push(relative(ROOT, full).replace(/\\/g, "/"));
        break;
      }
    }
  }
}

walk(SRC);

if (hits.length > 0) {
  console.error(
    "Forbidden Chatbox reference imports found under src/:\n" +
      hits.map((h) => `  - ${h}`).join("\n"),
  );
  process.exit(1);
}

console.log("OK: no references/chatbox or wiki/wiki_chatbox imports under src/");
