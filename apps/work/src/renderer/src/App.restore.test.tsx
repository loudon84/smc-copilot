import type React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopAuthState } from "../../shared/auth/auth-contract";

const skipPortalLogin = vi.hoisted(() => vi.fn(() => false));
const connect = vi.hoisted(() => vi.fn(async () => true));
const restoreRuntimeProvider = vi.hoisted(() => vi.fn(async () => ({ state: "NOT_READY" })));
const getConnectionConfig = vi.hoisted(() =>
  vi.fn(async () => ({ mode: "local" as const, remoteUrl: "" })),
);

vi.mock("../../shared/auth/auth-url", () => ({
  skipPortalLogin: () => skipPortalLogin(),
}));

vi.mock("./components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) =>
      key === "auth.loadingUserProfile" ? "Loading user profile" : key,
  }),
}));

vi.mock("./runtime/RuntimeProvider", () => ({
  RuntimeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./runtime/use-runtime", () => ({
  useRuntime: () => ({
    connect,
    status: { state: "error" },
    error: "down",
    validateHome: vi.fn(async () => false),
  }),
}));

vi.mock("./screens/Layout/Layout", () => ({
  default: () => <div>app-main</div>,
}));

vi.mock("./modules/auth/LoginScreen", () => ({
  LoginScreen: () => <div>login-screen</div>,
}));

vi.mock("./screens/ConnectionError/ConnectionErrorScreen", () => ({
  default: ({ onReconnect }: { onReconnect: () => void }) => (
    <button type="button" onClick={onReconnect}>
      Retry
    </button>
  ),
}));

vi.mock("./update/AppUpdateProvider", () => ({
  AppUpdateProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./update/UpdateAvailableDialog", () => ({
  UpdateAvailableDialog: () => null,
}));

vi.mock("./update/UpdateDownloadStatus", () => ({
  UpdateDownloadStatus: () => null,
}));

vi.mock("./update/UpdateReadyDialog", () => ({
  UpdateReadyDialog: () => null,
}));

vi.mock("./screens/SplashScreen/SplashScreen", () => ({
  default: ({
    status,
    busy,
  }: {
    status?: string;
    busy?: boolean;
  }) => (
    <div>
      <span>{status}</span>
      {busy ? <span className="splash-status-spinner" /> : null}
    </div>
  ),
}));

import App from "./App";

describe("cold start runtime restore", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
    skipPortalLogin.mockReturnValue(false);
    connect.mockReset();
    connect.mockResolvedValue(true);
    restoreRuntimeProvider.mockReset();
    restoreRuntimeProvider.mockResolvedValue({ state: "NOT_READY" });
    getConnectionConfig.mockReset();
    getConnectionConfig.mockResolvedValue({ mode: "local", remoteUrl: "" });
    Object.assign(window, {
      desktopAuth: {
        getState: vi.fn(
          async (): Promise<DesktopAuthState> =>
            ({ authenticated: true }) as DesktopAuthState,
        ),
        onStateChanged: () => () => undefined,
      },
      hermesAPI: {
        getConnectionConfig,
        restoreRuntimeProvider,
        getConfigHealth: vi.fn(async () => null),
        gatewayStatus: vi.fn(async () => ({})),
        runtimeGetStatus: vi.fn(async () => ({ state: "error" })),
        setConnectionConfig: vi.fn(async () => undefined),
        stopSshTunnel: vi.fn(async () => undefined),
        quitApp: vi.fn(),
        selectFolder: vi.fn(async () => null),
      },
    });
  });

  it("waits on the splash before showing main", async () => {
    let release: () => void = () => undefined;
    restoreRuntimeProvider.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ state: "NOT_READY" });
        }),
    );
    render(<App />);
    expect(await screen.findByText("Loading user profile")).toBeTruthy();
    expect(document.querySelector(".splash-status-spinner")).toBeTruthy();
    expect(screen.queryByText("app-main")).toBeNull();
    release();
    expect(await screen.findByText("app-main", {}, { timeout: 4000 })).toBeTruthy();
    expect(restoreRuntimeProvider).toHaveBeenCalledTimes(1);
  });

  it("does not restore when portal login is skipped", async () => {
    skipPortalLogin.mockReturnValue(true);
    render(<App />);
    expect(await screen.findByText("app-main", {}, { timeout: 4000 })).toBeTruthy();
    expect(restoreRuntimeProvider).not.toHaveBeenCalled();
    expect(screen.queryByText("Loading user profile")).toBeNull();
  });

  it("does not restore again when retrying a failed connection", async () => {
    connect.mockResolvedValueOnce(false);
    render(<App />);
    expect(await screen.findByText("Retry", {}, { timeout: 8000 })).toBeTruthy();
    expect(restoreRuntimeProvider).toHaveBeenCalledTimes(1);
    connect.mockResolvedValue(true);
    screen.getByText("Retry").click();
    await waitFor(
      () => {
        expect(screen.getByText("app-main")).toBeTruthy();
      },
      { timeout: 8000 },
    );
    expect(restoreRuntimeProvider).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Loading user profile")).toBeNull();
  }, 15000);
});
