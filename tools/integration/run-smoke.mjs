#!/usr/bin/env node
/**
 * Integration smoke:
 * 1) Start Runtime uvicorn
 * 2) Wait for /api/v1/health
 * 3) Call status + capabilities via generated client types surface (fetch)
 * 4) Validate error envelope shape
 * 5) Stop Runtime
 */
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RUNTIME = join(ROOT, "services/runtime");
const BASE = process.env.RUNTIME_BASE_URL ?? "http://127.0.0.1:8765";

async function waitHealth(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/v1/health`);
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await sleep(1000);
  }
  return false;
}

function startRuntime() {
  const child = spawn(
    "uv",
    ["run", "uvicorn", "main:app", "--app-dir", "src", "--host", "127.0.0.1", "--port", "8765"],
    {
      cwd: RUNTIME,
      env: {
        ...process.env,
        RUNTIME_REQUIRE_AUTH: process.env.RUNTIME_REQUIRE_AUTH ?? "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (d) => process.stdout.write(`[runtime] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[runtime] ${d}`));
  return child;
}

async function main() {
  const child = startRuntime();
  try {
    const ok = await waitHealth();
    if (!ok) throw new Error("Runtime health check timed out");

    const statusRes = await fetch(`${BASE}/api/v1/runtime/status`);
    if (!statusRes.ok) throw new Error(`status HTTP ${statusRes.status}`);
    const status = await statusRes.json();
    if (!status.apiVersion && !status.serviceVersion) {
      throw new Error("status missing apiVersion/serviceVersion");
    }

    const capsRes = await fetch(`${BASE}/api/v1/runtime/capabilities`);
    if (!capsRes.ok) throw new Error(`capabilities HTTP ${capsRes.status}`);
    const caps = await capsRes.json();
    if (!Array.isArray(caps.features)) throw new Error("capabilities.features missing");

    // Error envelope check (expect 404 envelope)
    const missing = await fetch(`${BASE}/api/v1/runtime/jobs/does-not-exist`);
    const body = await missing.json().catch(() => null);
    if (!body?.error?.code || !body?.error?.message) {
      throw new Error(`error envelope invalid: ${JSON.stringify(body)}`);
    }

    // Best-effort SSE probe: open job events on a missing job may fail quickly; not fatal.
    console.log("[integration-e2e] health/status/capabilities/error-envelope OK");
    console.log(`[integration-e2e] apiVersion=${status.apiVersion ?? caps.apiVersion}`);
  } finally {
    child.kill("SIGTERM");
    await sleep(1000);
    if (!child.killed) child.kill("SIGKILL");
  }
}

main().catch((err) => {
  console.error("[integration-e2e] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
