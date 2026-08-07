const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const projectRoot = path.resolve(__dirname);
const electronExe = path.join(
  projectRoot,
  "node_modules",
  "electron",
  "dist",
  "electron.exe",
);
const mainEntry = path.join(projectRoot, "out", "main", "index.js");

if (!fs.existsSync(electronExe)) {
  console.error("Electron not found:", electronExe);
  process.exit(1);
}

if (!fs.existsSync(mainEntry)) {
  console.error("Main entry not found:", mainEntry);
  process.exit(1);
}

console.log("Starting Electron...");
console.log("  Exe:", electronExe);
console.log("  Entry:", mainEntry);
console.log("  CWD:", path.resolve("/"));

const child = spawn(electronExe, [mainEntry], {
  cwd: "/",
  stdio: "inherit",
  env: {
    ...process.env,
    ELECTRON_ENTRY: mainEntry,
    PROJECT_ROOT: projectRoot,
  },
});

child.on("close", (code) => process.exit(code));
child.on("error", (err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
