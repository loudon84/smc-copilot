/**
 * CI gate: UI modules without Tailwind build must not use Tailwind utility classes.
 * Scans Workspaces + SettingsDrawer (+ hermes-runtime sections used in drawer).
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOTS = [
  path.join(__dirname, "..", "src", "renderer", "src", "screens", "Workspaces"),
  path.join(__dirname, "..", "src", "renderer", "src", "screens", "SettingsDrawer"),
  path.join(__dirname, "..", "src", "renderer", "src", "modules", "hermes-runtime"),
];
const PATTERN = /gray-|bg-blue|flex |zinc-|emerald-|text-red-|text-sm text-/g;
const EXT = new Set([".tsx", ".ts", ".jsx", ".js"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.name === "node_modules" || ent.name === "dist") continue;
    if (ent.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(ent.name))) out.push(full);
  }
  return out;
}

const violations = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!PATTERN.test(line)) {
        PATTERN.lastIndex = 0;
        continue;
      }
      PATTERN.lastIndex = 0;
      violations.push({
        file: path.relative(path.join(__dirname, ".."), file).replace(/\\/g, "/"),
        line: i + 1,
        text: line.trim(),
      });
    }
  }
}

if (violations.length > 0) {
  console.error(
    `[check:workspaces-no-tailwind] Found ${violations.length} forbidden Tailwind utility pattern(s):\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}\n`);
  }
  console.error(
    "Use workspaces-* / settings-drawer-* classes and main.css design tokens.",
  );
  process.exit(1);
}

console.log(
  "[check:workspaces-no-tailwind] OK — no forbidden Tailwind patterns in Workspaces, SettingsDrawer, hermes-runtime",
);
