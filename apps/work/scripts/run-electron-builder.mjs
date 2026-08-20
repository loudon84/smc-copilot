#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnvFile } from "./lib/load-dotenv.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnvFile(join(root, ".env"));

const builderArgs = ["electron-builder", ...process.argv.slice(2)];
const command =
  process.platform === "win32"
    ? `npx electron-builder ${process.argv.slice(2).join(" ")}`
    : "npx";
const args = process.platform === "win32" ? [] : builderArgs;
const result = spawnSync(command, args, {
  cwd: root,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
