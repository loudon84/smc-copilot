import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppUpdateProvider, useAppUpdate } from "./AppUpdateProvider";
import type { AppUpdateState } from "../../../shared/app-update";

function makeState(
  revision: number,
  status: AppUpdateState["status"],
  patch: Partial<AppUpdateState> = {},
): AppUpdateState {
  return {
    schemaVersion: 2,
    revision,
    supported: true,
    status,
    currentVersion: "1.0.0",
    availableVersion: null,
    releaseDate: null,
    releaseNotes: null,
    percent: null,
    transferred: null,
    total: null,
    bytesPerSecond: null,
    error: null,
    checkedAt: null,
    updatedAt: `2026-08-18T00:00:0${revision}.000Z`,
    ...patch,
  };
}

function Consumer(): React.JSX.Element {
  const { state } = useAppUpdate();
  return (
    <div data-testid="state">
      {state ? `${state.revision}:${state.status}:${state.availableVersion ?? ""}` : "empty"}
    </div>
  );
}

describe("AppUpdateProvider", () => {
  let listener: ((state: AppUpdateState) => void) | null = null;
  const cleanup = vi.fn();

  beforeEach(() => {
    cleanup.mockReset();
    listener = null;
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        onUpdateStateChanged: vi.fn((cb: (state: AppUpdateState) => void) => {
          listener = cb;
          return cleanup;
        }),
        getUpdateState: vi.fn(async () => makeState(1, "idle")),
        checkForUpdates: vi.fn(async () => makeState(2, "checking")),
        downloadUpdate: vi.fn(async () => makeState(3, "downloading")),
        installUpdate: vi.fn(async () => makeState(4, "installing")),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps an early event over an older snapshot", async () => {
    vi.mocked(window.hermesAPI.getUpdateState).mockImplementation(
      async () => makeState(1, "idle"),
    );
    window.hermesAPI.onUpdateStateChanged = vi.fn((cb) => {
      listener = cb;
      cb(makeState(2, "available", { availableVersion: "1.1.0" }));
      return cleanup;
    });

    render(
      <AppUpdateProvider>
        <Consumer />
      </AppUpdateProvider>,
    );

    expect(await screen.findByText("2:available:1.1.0")).toBeTruthy();
  });

  it("accepts a newer event after the initial snapshot", async () => {
    render(
      <AppUpdateProvider>
        <Consumer />
      </AppUpdateProvider>,
    );

    expect(await screen.findByText("1:idle:")).toBeTruthy();

    act(() => {
      listener?.(makeState(2, "ready", { availableVersion: "1.1.0" }));
    });

    expect(screen.getByText("2:ready:1.1.0")).toBeTruthy();
  });

  it("ignores stale revisions", async () => {
    window.hermesAPI.getUpdateState = vi.fn(async () =>
      makeState(3, "available", { availableVersion: "1.2.0" }),
    );

    render(
      <AppUpdateProvider>
        <Consumer />
      </AppUpdateProvider>,
    );

    expect(await screen.findByText("3:available:1.2.0")).toBeTruthy();

    act(() => {
      listener?.(makeState(2, "idle"));
    });

    expect(screen.getByText("3:available:1.2.0")).toBeTruthy();
  });

  it("removes the subscription on unmount", () => {
    const view = render(
      <AppUpdateProvider>
        <Consumer />
      </AppUpdateProvider>,
    );

    view.unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
