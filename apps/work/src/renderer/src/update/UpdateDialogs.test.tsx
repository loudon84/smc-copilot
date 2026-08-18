import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../components/I18nProvider";
import { AppUpdateProvider } from "./AppUpdateProvider";
import { UpdateAvailableDialog } from "./UpdateAvailableDialog";
import { UpdateDownloadStatus } from "./UpdateDownloadStatus";
import { UpdateReadyDialog } from "./UpdateReadyDialog";
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
    currentVersion: "0.7.4",
    availableVersion: "0.7.5",
    releaseDate: "2026-08-18T00:00:00.000Z",
    releaseNotes: "- New updater dialogs",
    percent: status === "downloading" ? 40 : null,
    transferred: null,
    total: null,
    bytesPerSecond: null,
    error: null,
    checkedAt: null,
    updatedAt: `2026-08-18T00:00:0${revision}.000Z`,
    ...patch,
  };
}

function renderDialogs(): void {
  render(
    <I18nProvider>
      <AppUpdateProvider>
        <UpdateAvailableDialog />
        <UpdateDownloadStatus />
        <UpdateReadyDialog />
      </AppUpdateProvider>
    </I18nProvider>,
  );
}

describe("app update dialogs", () => {
  const downloadUpdate = vi.fn(async () => makeState(3, "downloading"));
  const installUpdate = vi.fn(async () => makeState(4, "installing"));

  beforeEach(() => {
    downloadUpdate.mockClear();
    installUpdate.mockClear();
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        onUpdateStateChanged: vi.fn(() => () => undefined),
        getUpdateState: vi.fn(async () => makeState(2, "available")),
        checkForUpdates: vi.fn(async () => makeState(2, "available")),
        downloadUpdate,
        installUpdate,
      },
    });
  });

  it("shows the available dialog and later does not download", async () => {
    renderDialogs();
    expect(await screen.findByText("SMC-Copilot has a new version")).toBeTruthy();
    expect(screen.getByText(/Current version: 0\.7\.4/)).toBeTruthy();
    expect(screen.getByText(/Latest version: 0\.7\.5/)).toBeTruthy();
    expect(screen.getByText("- New updater dialogs")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(downloadUpdate).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText("SMC-Copilot has a new version")).toBeNull();
    });
  });

  it("downloads only after the user confirms", async () => {
    renderDialogs();
    await screen.findByText("SMC-Copilot has a new version");
    fireEvent.click(screen.getByRole("button", { name: "Download update" }));
    expect(downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it("shows download progress from the shared snapshot", async () => {
    window.hermesAPI.getUpdateState = vi.fn(async () =>
      makeState(3, "downloading", { percent: 40 }),
    );
    renderDialogs();
    expect(await screen.findByText("Downloading SMC-Copilot 0.7.5")).toBeTruthy();
    expect(screen.getByText("Downloading 40%")).toBeTruthy();
  });

  it("installs only after the user confirms ready", async () => {
    window.hermesAPI.getUpdateState = vi.fn(async () => makeState(4, "ready"));
    renderDialogs();
    expect(
      await screen.findByText("SMC-Copilot 0.7.5 is ready to install"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Install now" }));
    expect(installUpdate).toHaveBeenCalledTimes(1);
  });
});
