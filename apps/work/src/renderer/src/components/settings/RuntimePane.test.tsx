// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesRuntimeProbe } from "../../../../shared/runtime/runtime-contract";
import type { ControlOwnerSnapshot } from "../../../../shared/runtime/control-owner";
import type { RuntimeContextValue } from "../../runtime/runtime-context";

const {
  connectMock,
  refreshMock,
  validateHomeMock,
  adoptHomeMock,
  selectFolderMock,
  getControlOwnerMock,
  runtimeGetStatusMock,
  runtimeValue,
} = vi.hoisted(() => {
  const probe = (): HermesRuntimeProbe => ({
    mode: "local",
    state: "gateway_unreachable",
    endpoint: "http://127.0.0.1:8642",
    runtimeFound: true,
    cliAvailable: true,
    gatewayRunning: false,
    gatewayHealthy: false,
    authenticated: false,
    homePath: "C:\\Users\\test\\AppData\\Local\\hermes",
  });
  const connectMock = vi.fn(async () => false);
  const refreshMock = vi.fn(async () => {});
  const validateHomeMock = vi.fn(async () => true);
  const adoptHomeMock = vi.fn(async () => true);
  const selectFolderMock = vi.fn(async () => "C:\\chosen-home");
  const getControlOwnerMock = vi.fn();
  const runtimeGetStatusMock = vi.fn();
  const runtimeValue: RuntimeContextValue = {
    state: "gateway_unreachable",
    status: probe(),
    connecting: false,
    ready: false,
    error: null,
    lastStatus: probe(),
    connect: connectMock,
    refresh: refreshMock,
    restart: vi.fn(async () => false),
    validateHome: validateHomeMock,
    adoptHome: adoptHomeMock,
  };
  return {
    connectMock,
    refreshMock,
    validateHomeMock,
    adoptHomeMock,
    selectFolderMock,
    getControlOwnerMock,
    runtimeGetStatusMock,
    runtimeValue,
  };
});

vi.mock("../../runtime/use-runtime", () => ({
  useRuntime: (): RuntimeContextValue => runtimeValue,
}));

import RuntimePane from "./RuntimePane";

function stubApi(owner: ControlOwnerSnapshot): void {
  getControlOwnerMock.mockResolvedValue(owner);
  runtimeGetStatusMock.mockResolvedValue(runtimeValue.status);
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: {
      getControlOwner: getControlOwnerMock,
      runtimeGetStatus: runtimeGetStatusMock,
      selectFolder: selectFolderMock,
      getHermesHome: vi.fn(async () => "C:\\Users\\test\\AppData\\Local\\hermes"),
      openExternal: vi.fn(),
      relaunchApp: vi.fn(),
    },
  });
}

describe("RuntimePane Self-Install gate", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    connectMock.mockClear();
    refreshMock.mockClear();
    validateHomeMock.mockClear();
    adoptHomeMock.mockClear();
    selectFolderMock.mockClear();
    getControlOwnerMock.mockReset();
    runtimeGetStatusMock.mockReset();
  });

  // @lat: [[runtime-connection#Direct Hermes Mode]]
  it("shows Choose Hermes directory for native-hermes with effective direct", async () => {
    stubApi({
      observed: "direct",
      effective: "direct",
      owner: "direct",
      source: "default",
    });
    render(<RuntimePane />);

    await waitFor(() => {
      expect(getControlOwnerMock).toHaveBeenCalled();
    });
    expect(
      screen.getByRole("button", { name: "Choose Hermes directory" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("does not block Choose Hermes directory when observed opsi but effective direct", async () => {
    stubApi({
      observed: "opsi",
      effective: "direct",
      owner: "opsi",
      source: "file",
    });
    const first = render(<RuntimePane />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Choose Hermes directory" }),
      ).toBeTruthy();
    });
    expect(screen.queryByText(/Managed by organization \(OPSI\)/i)).toBeNull();
    first.unmount();

    stubApi({
      observed: "salt",
      effective: "direct",
      owner: "salt",
      source: "file",
    });
    render(<RuntimePane />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Choose Hermes directory" }),
      ).toBeTruthy();
    });
  });

  it("Reconnect probes only and never opens Self-Install folder picker until chosen", async () => {
    stubApi({
      observed: "direct",
      effective: "direct",
      owner: "direct",
      source: "default",
    });
    render(<RuntimePane />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Reconnect" })).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    });
    expect(connectMock).toHaveBeenCalled();
    expect(selectFolderMock).not.toHaveBeenCalled();
    expect(validateHomeMock).not.toHaveBeenCalled();
    expect(adoptHomeMock).not.toHaveBeenCalled();
  });
});
