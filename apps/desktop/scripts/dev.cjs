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

// Local UI default: skip Startup Gate blocking on Runtime :8765.
// Override with SMC_DESKTOP_SKIP_RUNTIME=false when testing recovery / pairing.
if (process.env.SMC_DESKTOP_SKIP_RUNTIME === undefined) {
  process.env.SMC_DESKTOP_SKIP_RUNTIME = "true";
}

// Main process: attach debugger at chrome://inspect or VS Code "Attach to 9229"
console.log("[dev] electron-vite dev --inspect=9229 --sourcemap (Main attach port 9229)");
if (process.env.SMC_DESKTOP_SKIP_RUNTIME === "true") {
  console.log("[dev] SMC_DESKTOP_SKIP_RUNTIME=true (enter main without Runtime; set false to enforce gate)");
}

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
