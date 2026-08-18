import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const send = vi.fn();
const appMock = {
  getVersion: vi.fn(() => "1.0.0"),
  getPath: vi.fn(() => "C:\\Users\\test\\AppData\\Roaming\\smc-work"),
  isPackaged: true,
  once: vi.fn(),
};

class MockUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  logger: unknown = null;
  quitAndInstall = vi.fn();
  checkForUpdates = vi.fn(async () => {
    const info = {
      version: "1.1.0",
      releaseDate: "2026-08-18T00:00:00.000Z",
      releaseNotes: "Release notes",
    };
    this.emit("update-available", info);
    return { updateInfo: info };
  });
  downloadUpdate = vi.fn(async () => {
    this.emit("download-progress", {
      percent: 42,
      transferred: 42,
      total: 100,
      bytesPerSecond: 10,
    });
    this.emit("update-downloaded", {
      version: "1.1.0",
      releaseDate: "2026-08-18T00:00:00.000Z",
      releaseNotes: "Release notes",
    });
  });
}

const mockUpdater = new MockUpdater();

vi.mock("electron", () => ({
  app: appMock,
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    }),
  },
}));

describe("setupUpdater", () => {
  beforeEach(() => {
    handlers.clear();
    send.mockReset();
    appMock.isPackaged = true;
    mockUpdater.removeAllListeners();
    mockUpdater.autoDownload = true;
    mockUpdater.autoInstallOnAppQuit = true;
    mockUpdater.checkForUpdates.mockClear();
    mockUpdater.downloadUpdate.mockClear();
    mockUpdater.quitAndInstall.mockClear();
    delete process.env.PORTABLE_EXECUTABLE_DIR;
    vi.resetModules();
  });

  it("returns an unsupported snapshot outside packaged updater mode", async () => {
    appMock.isPackaged = false;
    const { setupUpdater } = await import("./updater");
    setupUpdater({
      getMainWindow: () => ({ webContents: { send } }) as never,
      loadAutoUpdater: () => mockUpdater as never,
    });

    const getState = handlers.get("app-update:get-state");
    const state = await getState?.();
    expect(state).toMatchObject({
      schemaVersion: 2,
      supported: false,
      status: "idle",
      currentVersion: "1.0.0",
    });
  });

  it("maps check and download events into a monotonic snapshot", async () => {
    const { setupUpdater } = await import("./updater");
    setupUpdater({
      getMainWindow: () => ({ webContents: { send } }) as never,
      loadAutoUpdater: () => mockUpdater as never,
    });

    expect(mockUpdater.autoDownload).toBe(false);
    expect(mockUpdater.autoInstallOnAppQuit).toBe(false);

    const check = handlers.get("app-update:check");
    const download = handlers.get("app-update:download");
    const checked = (await check?.()) as {
      revision: number;
      supported: boolean;
      status: string;
      availableVersion: string | null;
    };
    expect(checked).toMatchObject({
      supported: true,
      status: "available",
      availableVersion: "1.1.0",
    });

    const ready = (await download?.()) as {
      revision: number;
      status: string;
      availableVersion: string | null;
      percent: number | null;
    };
    expect(ready).toMatchObject({
      status: "ready",
      availableVersion: "1.1.0",
      percent: null,
    });
    expect(ready?.revision).toBeGreaterThan(checked?.revision ?? -1);
  });

  it("keeps ready state when a later background error arrives", async () => {
    const { setupUpdater } = await import("./updater");
    setupUpdater({
      getMainWindow: () => ({ webContents: { send } }) as never,
      loadAutoUpdater: () => mockUpdater as never,
    });

    const check = handlers.get("app-update:check");
    const download = handlers.get("app-update:download");
    const getState = handlers.get("app-update:get-state");
    await check?.();
    await download?.();
    mockUpdater.emit("error", new Error("background check failed"));

    const state = await getState?.();
    expect(state).toMatchObject({
      status: "ready",
      availableVersion: "1.1.0",
    });
  });

  it("only installs after ready", async () => {
    const { setupUpdater } = await import("./updater");
    setupUpdater({
      getMainWindow: () => ({ webContents: { send } }) as never,
      loadAutoUpdater: () => mockUpdater as never,
    });

    const install = handlers.get("app-update:install");
    const check = handlers.get("app-update:check");
    const download = handlers.get("app-update:download");

    const ignored = await install?.();
    expect(ignored).toMatchObject({ status: "idle" });
    expect(mockUpdater.quitAndInstall).not.toHaveBeenCalled();

    await check?.();
    await download?.();
    const installing = await install?.();
    expect(installing).toMatchObject({ status: "installing" });
    expect(mockUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });
});
