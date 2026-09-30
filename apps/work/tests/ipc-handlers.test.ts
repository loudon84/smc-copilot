import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
// After the app/ refactor, ipcMain.handle registrations live in the dedicated
// IPC registration module plus the updater module, not in index.ts.
// File Platform handlers are registered via FILES_IPC_CHANNELS constants in
// register-file-ipc.ts; preload invokes them from files-api.ts.
const indexSrc = [
  "src/main/ipc/register.ts",
  "src/main/app/updater.ts",
  "src/main/files/register-file-ipc.ts",
]
  .map((p) => readFileSync(join(ROOT, p), "utf-8"))
  .join("\n");
const preloadSrc = [
  "src/preload/index.ts",
  "src/preload/files-api.ts",
]
  .map((p) => readFileSync(join(ROOT, p), "utf-8"))
  .join("\n");
const filesIpcContractSrc = readFileSync(
  join(ROOT, "src/shared/files/file-ipc.ts"),
  "utf-8",
);
const appUpdateContractSrc = readFileSync(
  join(ROOT, "src/shared/app-update.ts"),
  "utf-8",
);

/**
 * Extract all IPC channel names registered in main/index.ts.
 * Also expands FILES_IPC_CHANNELS.* references via the shared contract.
 */
function extractIpcHandleChannels(src: string): string[] {
  const channels: string[] = [];
  const re = /ipcMain\.handle\(\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    channels.push(m[1]);
  }
  // Expand `ipcMain.handle(FILES_IPC_CHANNELS.foo, ...)` using the contract map.
  const constMap = extractFilesIpcChannelMap(filesIpcContractSrc);
  const refRe = /ipcMain\.handle\(\s*FILES_IPC_CHANNELS\.(\w+)/g;
  while ((m = refRe.exec(src)) !== null) {
    const resolved = constMap[m[1]];
    if (resolved) channels.push(resolved);
  }
  const appUpdateMap = extractAppUpdateChannelMap(appUpdateContractSrc);
  const appUpdateRefRe = /ipcMain\.handle\(\s*APP_UPDATE_CHANNELS\.(\w+)/g;
  while ((m = appUpdateRefRe.exec(src)) !== null) {
    const resolved = appUpdateMap[m[1]];
    if (resolved) channels.push(resolved);
  }
  return [...new Set(channels)];
}

function extractFilesIpcChannelMap(src: string): Record<string, string> {
  const map: Record<string, string> = {};
  const re = /(\w+)\s*:\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

function extractAppUpdateChannelMap(src: string): Record<string, string> {
  const map: Record<string, string> = {};
  const re = /(\w+)\s*:\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

/**
 * Extract all ipcRenderer.invoke channel names from preload.
 */
function extractPreloadInvokeChannels(src: string): string[] {
  const channels: string[] = [];
  const re = /ipcRenderer\.invoke\(\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    channels.push(m[1]);
  }
  const constMap = extractFilesIpcChannelMap(filesIpcContractSrc);
  const refRe = /ipcRenderer\.invoke\(\s*FILES_IPC_CHANNELS\.(\w+)/g;
  while ((m = refRe.exec(src)) !== null) {
    const resolved = constMap[m[1]];
    if (resolved) channels.push(resolved);
  }
  const appUpdateMap = extractAppUpdateChannelMap(appUpdateContractSrc);
  const appUpdateRefRe = /ipcRenderer\.invoke\(\s*APP_UPDATE_CHANNELS\.(\w+)/g;
  while ((m = appUpdateRefRe.exec(src)) !== null) {
    const resolved = appUpdateMap[m[1]];
    if (resolved) channels.push(resolved);
  }
  return [...new Set(channels)];
}

const mainChannels = extractIpcHandleChannels(indexSrc);
const preloadChannels = extractPreloadInvokeChannels(preloadSrc);

describe("IPC Handler �?Preload Consistency", () => {
  it("main process registers IPC handlers", () => {
    expect(mainChannels.length).toBeGreaterThan(30);
  });

  it("preload invokes IPC channels", () => {
    expect(preloadChannels.length).toBeGreaterThan(30);
  });

  it("every preload invoke has a matching main handler", () => {
    const missing = preloadChannels.filter((ch) => !mainChannels.includes(ch));
    expect(missing).toEqual([]);
  });

  it("every main handler has a matching preload invoke", () => {
    const missing = mainChannels.filter((ch) => !preloadChannels.includes(ch));
    expect(missing).toEqual([]);
  });
});

// ─── New feature handlers registered ────────────────────

describe("New IPC handlers from v0.8/v0.9 features", () => {
  const newChannels = [
    "run-hermes-backup",
    "run-hermes-import",
    "read-logs",
    "run-hermes-dump",
    "list-mcp-servers",
    "add-mcp-server",
    "remove-mcp-server",
    "set-mcp-server-enabled",
    "test-mcp-server",
    "list-mcp-catalog",
    "install-mcp-catalog-entry",
    "discover-memory-providers",
  ];

  for (const ch of newChannels) {
    it(`main has handler: ${ch}`, () => {
      expect(mainChannels).toContain(ch);
    });

    it(`preload invokes: ${ch}`, () => {
      expect(preloadChannels).toContain(ch);
    });
  }
});

// ─── Legacy handlers still present ──────────────────────

describe("Legacy IPC handlers preserved", () => {
  const legacyChannels = [
    "get-hermes-version",
    "run-hermes-doctor",
    "run-hermes-update",
    "get-env",
    "set-env",
    "get-config",
    "set-config",
    "get-model-config",
    "set-model-config",
    "send-message",
    "abort-chat",
    "start-gateway",
    "stop-gateway",
    "restart-gateway",
    "gateway-status",
    "get-platform-enabled",
    "set-platform-enabled",
    "list-sessions",
    "get-session-messages",
    "list-profiles",
    "create-profile",
    "list-cron-jobs",
    "create-cron-job",
    "open-external",
    "open-terminal",
  ];

  for (const ch of legacyChannels) {
    it(`${ch} handler still registered`, () => {
      expect(mainChannels).toContain(ch);
    });
  }
});

describe("Runtime IPC replaces install gate", () => {
  const runtimeChannels = [
    "runtime-probe-local",
    "runtime-ensure-local-ready",
    "runtime-get-status",
    "runtime-restart",
    "runtime-validate-home",
    "runtime-adopt-home",
  ];

  for (const ch of runtimeChannels) {
    it(`main has handler: ${ch}`, () => {
      expect(mainChannels).toContain(ch);
    });
    it(`preload invokes: ${ch}`, () => {
      expect(preloadChannels).toContain(ch);
    });
  }

  const removedInstallChannels = [
    "check-install",
    "verify-install",
    "start-install",
    "inspect-install-target",
    "validate-hermes-home",
    "adopt-hermes-home",
  ];

  for (const ch of removedInstallChannels) {
    it(`install channel removed: ${ch}`, () => {
      expect(mainChannels).not.toContain(ch);
      expect(preloadChannels).not.toContain(ch);
    });
  }
});
