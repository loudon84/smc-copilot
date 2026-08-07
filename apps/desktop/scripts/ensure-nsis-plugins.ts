import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = join(__dirname, "..");
const YML_PATH = join(ROOT, "electron-builder.yml");
const ENVAR_DLL_DIR = join(ROOT, "build", "nsis", "Plugins", "x86-unicode");
const ENVAR_DLL_PATH = join(ENVAR_DLL_DIR, "EnVar.dll");
const ENVAR_DOWNLOAD_URL =
  "https://github.com/GsNSIS/EnVar/releases/download/v1.2/EnVar-1.2-unicode.zip";

function guardNsisConfig(): void {
  const yml = readFileSync(YML_PATH, "utf-8");
  const oneClickMatch = yml.match(/^\s*oneClick:\s*(true|false)/m);
  if (oneClickMatch && oneClickMatch[1] === "true") {
    console.error(
      "[build-guard] ERROR: nsis.oneClick is true. V1.3 requires assisted installer (oneClick: false).",
    );
    process.exit(1);
  }
  console.log("[build-guard] nsis.oneClick check passed");
}

function ensureEnVarPlugin(): void {
  if (existsSync(ENVAR_DLL_PATH)) {
    console.log("[build-guard] EnVar.dll already present");
    return;
  }

  console.log("[build-guard] EnVar.dll not found, downloading...");
  mkdirSync(ENVAR_DLL_DIR, { recursive: true });

  const tmpZip = join(ENVAR_DLL_DIR, "envar.zip");
  try {
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri '${ENVAR_DOWNLOAD_URL}' -OutFile '${tmpZip}'"`,
      { encoding: "utf-8", timeout: 60000 },
    );
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '${tmpZip}' -DestinationPath '${ENVAR_DLL_DIR}' -Force"`,
      { encoding: "utf-8", timeout: 30000 },
    );

    const dllInSubdir = join(
      ENVAR_DLL_DIR,
      "Plugins",
      "x86-unicode",
      "EnVar.dll",
    );
    if (existsSync(dllInSubdir) && !existsSync(ENVAR_DLL_PATH)) {
      const { copyFileSync } = require("fs") as typeof import("fs");
      copyFileSync(dllInSubdir, ENVAR_DLL_PATH);
    }

    console.log("[build-guard] EnVar.dll installed successfully");
  } catch (err) {
    console.warn(
      `[build-guard] WARNING: Failed to download EnVar plugin: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.warn(
      "[build-guard] Please manually download EnVar.dll from https://github.com/GsNSIS/EnVar/releases and place it at:",
    );
    console.warn(`  ${ENVAR_DLL_PATH}`);
  } finally {
    try {
      const { unlinkSync } = require("fs") as typeof import("fs");
      if (existsSync(tmpZip)) unlinkSync(tmpZip);
    } catch {
      /* ignore */
    }
  }
}

guardNsisConfig();
ensureEnVarPlugin();
