#!/usr/bin/env node
/** V09 — assert WORK-KNOWLEDGE-UI-01 visual checklist exists and covers six pages. */
import fs from "node:fs";

const path = "docs_agent/evidence/WORK-KNOWLEDGE-UI-01-visual-checklist.md";
if (!fs.existsSync(path)) {
  console.error(`missing ${path}`);
  process.exit(1);
}
const text = fs.readFileSync(path, "utf8");
const required = ["Home", "Bases", "Sets", "Documents", "Uploads", "Chat"];
for (const name of required) {
  if (!text.includes(name)) {
    console.error(`checklist missing page domain: ${name}`);
    process.exit(1);
  }
}
console.log("V09 visual checklist OK");
