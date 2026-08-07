import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const indexSrc = readFileSync(join(ROOT, "src/main/index.ts"), "utf-8");
const windowIpcSrc = readFileSync(join(ROOT, "src/main/window/window-ipc.ts"), "utf-8");
const authIpcSrc = readFileSync(join(ROOT, "src/main/auth/auth-ipc.ts"), "utf-8");
const userConfigIpcSrc = readFileSync(
  join(ROOT, "src/main/user-config/user-config-ipc.ts"),
  "utf-8",
);
const aiosIpcSrc = readFileSync(join(ROOT, "src/main/aios/aios-ipc.ts"), "utf-8");
const startupIpcSrc = readFileSync(join(ROOT, "src/main/startup/startup-ipc.ts"), "utf-8");
const shellApiSrc = readFileSync(join(ROOT, "src/preload/shell-api.ts"), "utf-8");
const preloadSrc = [
  readFileSync(join(ROOT, "src/preload/index.ts"), "utf-8"),
  readFileSync(join(ROOT, "src/preload/auth-api.ts"), "utf-8"),
  readFileSync(join(ROOT, "src/preload/user-config-api.ts"), "utf-8"),
  readFileSync(join(ROOT, "src/preload/aios-api.ts"), "utf-8"),
  shellApiSrc,
].join("\n");

/**
 * Extract IPC channel names from ipcMain.handle or safeHandle registrations.
 */
function extractIpcHandleChannels(src: string): string[] {
  const channels: string[] = [];
  const re = /(?:ipcMain\.handle|safeHandle)\(\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    channels.push(m[1]);
  }
  return [...new Set(channels)];
}

/**
 * Extract all ipcRenderer.invoke channel names from preload sources.
 */
function extractPreloadInvokeChannels(src: string): string[] {
  const channels: string[] = [];
  const re = /ipcRenderer\.invoke\(\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    channels.push(m[1]);
  }
  return [...new Set(channels)];
}

// Channels dynamically registered in separate modules (not detectable by regex)
const DYNAMIC_MAIN_CHANNELS = [
  // Enterprise IPC (registered in enterprise/enterprise-ipc.ts via setupEnterpriseInstallIPC)
  "enterprise:get-runtime-state",
  "enterprise:repair",
  "enterprise:reinstall-runtime",
  "enterprise:get-deployment-config",
  "enterprise:validate-deployment-config",
  "enterprise:preflight",
  "enterprise:install",
  "enterprise:install-cancel",
  "enterprise:update",
  "enterprise:rollback",
  "enterprise:get-install-marker",
  "enterprise:get-install-log",
  "enterprise:open-log-dir",
  "enterprise:run-doctor",
  "enterprise:export-doctor-report",
  "enterprise:get-migration-status",
  // First Run Wizard IPC (registered in enterprise/first-run-wizard.ts)
  "first-run-wizard:detect-agent",
  "first-run-wizard:start-install",
  "first-run-wizard:cancel-install",
  "first-run-wizard:select-zip-file",
  "enterprise:get-installer-precheck",
];

// Preload still invokes these; handlers live in deprecated AiOsWebContentsController (not registered at runtime)
const DEPRECATED_PRELOAD_CHANNELS = [
  "aios:install",
  "aios:view:load-home",
  "aios:view:reload",
  "aios:view:set-bounds",
];

// Channels used internally or via dedicated preload modules not scanned here
const MAIN_ONLY_CHANNELS = [
  "internal-view:get-data",
  "shortcut:get-all",
  "shortcut:update",
  "shortcut:reset",
  "shortcut:validate",
  "shortcut:check-conflicts",
];

const mainChannels = [
  ...extractIpcHandleChannels(indexSrc),
  ...extractIpcHandleChannels(windowIpcSrc),
  ...extractIpcHandleChannels(authIpcSrc),
  ...extractIpcHandleChannels(userConfigIpcSrc),
  ...extractIpcHandleChannels(aiosIpcSrc),
  ...extractIpcHandleChannels(startupIpcSrc),
  ...DYNAMIC_MAIN_CHANNELS,
];
const preloadChannels = extractPreloadInvokeChannels(preloadSrc);

describe("IPC Handler ↔ Preload Consistency", () => {
  it("main process registers IPC handlers", () => {
    expect(mainChannels.length).toBeGreaterThan(30);
  });

  it("preload invokes IPC channels", () => {
    expect(preloadChannels.length).toBeGreaterThan(30);
  });

  it("every preload invoke has a matching main handler", () => {
    const missing = preloadChannels.filter(
      (ch) => !mainChannels.includes(ch) && !DEPRECATED_PRELOAD_CHANNELS.includes(ch),
    );
    expect(missing).toEqual([]);
  });

  it("every main handler has a matching preload invoke", () => {
    const filteredMainChannels = mainChannels.filter((ch) => !MAIN_ONLY_CHANNELS.includes(ch));
    const missing = filteredMainChannels.filter((ch) => !preloadChannels.includes(ch));
    expect(missing).toEqual([]);
  });
});

// ─── New feature handlers registered ────────────────────

describe("Window IPC handlers (window-ipc.ts)", () => {
  const windowChannels = [
    "window:minimize",
    "window:maximize-or-restore",
    "window:close",
    "window:is-maximized",
  ];

  for (const ch of windowChannels) {
    it(`window-ipc registers: ${ch}`, () => {
      expect(extractIpcHandleChannels(windowIpcSrc)).toContain(ch);
    });

    it(`preload invokes: ${ch}`, () => {
      expect(preloadChannels).toContain(ch);
    });
  }

  it("main index registers window IPC module", () => {
    expect(indexSrc).toContain("registerWindowIpc");
    expect(indexSrc).toContain("bindMainBrowserWindow");
  });
});

describe("New IPC handlers from v0.8/v0.9 features", () => {
  const newChannels = [
    "run-hermes-backup",
    "run-hermes-import",
    "read-logs",
    "run-hermes-dump",
    "list-mcp-servers",
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

describe("Startup IPC handlers (V3.3)", () => {
  it("startup-ipc registers startup:resolve-decision", () => {
    expect(extractIpcHandleChannels(startupIpcSrc)).toContain("startup:resolve-decision");
  });

  it("main index calls setupStartupIPC", () => {
    expect(indexSrc).toContain("setupStartupIPC");
  });

  it("preload exposes smcShell and invokes startup:resolve-decision", () => {
    expect(readFileSync(join(ROOT, "src/preload/index.ts"), "utf-8")).toContain(
      'exposeInMainWorld("smcShell"',
    );
    expect(shellApiSrc).toContain('"startup:resolve-decision"');
    expect(preloadChannels).toContain("startup:resolve-decision");
  });
});

describe("Auth IPC handlers (V3.3)", () => {
  const authChannels = [
    "auth:get-state",
    "auth:save-endpoint-config",
    "auth:login",
    "auth:logout",
    "auth:refresh",
  ];

  for (const ch of authChannels) {
    it(`auth-ipc registers: ${ch}`, () => {
      expect(extractIpcHandleChannels(authIpcSrc)).toContain(ch);
    });

    it(`preload invokes: ${ch}`, () => {
      expect(preloadChannels).toContain(ch);
    });
  }
});

describe("Legacy IPC handlers preserved", () => {
  const legacyChannels = [
    "check-install",
    "start-install",
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
  ];

  for (const ch of legacyChannels) {
    it(`${ch} handler still registered`, () => {
      expect(mainChannels).toContain(ch);
    });
  }
});
