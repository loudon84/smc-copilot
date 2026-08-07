/**
 * Dev entry: on Windows, switch console to UTF-8 (CP65001) before electron-vite
 * so Chinese log messages from Main (e.g. HostBridge audit) render correctly.
 */
const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");

function ensureWinUtf8Console() {
  if (process.platform !== "win32") return;

  try {
    spawnSync("cmd.exe", ["/d", "/s", "/c", "chcp", "65001", ">nul"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    /* non-fatal */
  }

  if (typeof process.stdout?.setDefaultEncoding === "function") {
    try {
      process.stdout.setDefaultEncoding("utf8");
      process.stderr.setDefaultEncoding("utf8");
    } catch {
      /* ignore */
    }
  }
}

ensureWinUtf8Console();

// Main process: attach debugger at chrome://inspect or VS Code "Attach to 9229"
console.log("[dev] electron-vite dev --inspect=9229 --sourcemap (Main attach port 9229)");

const child = spawn("npx", ["electron-vite", "dev", "--inspect=9229", "--sourcemap"], {
  cwd: projectRoot,
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
