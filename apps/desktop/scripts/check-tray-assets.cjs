const fs = require("fs");
const path = require("path");

const required = ["build/icon.ico", "resources/icon.png"];

let failed = false;

for (const file of required) {
  const abs = path.resolve(process.cwd(), file);
  if (!fs.existsSync(abs)) {
    console.error(`[TRAY ASSET] Missing: ${file}`);
    failed = true;
  } else {
    console.log(`[TRAY ASSET] OK: ${file}`);
  }
}

if (failed) {
  process.exit(1);
}
