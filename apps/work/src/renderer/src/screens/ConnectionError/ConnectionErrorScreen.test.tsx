// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesRuntimeProbe } from "../../../../shared/runtime/runtime-contract";
import type { HermesControlOwner } from "../../../../shared/runtime/control-owner";
import ConnectionErrorScreen from "./ConnectionErrorScreen";

const getControlOwnerMock = vi.fn();

function probe(): HermesRuntimeProbe {
  return {
    mode: "local",
    state: "gateway_unreachable",
    endpoint: "http://127.0.0.1:8642",
    runtimeFound: true,
    cliAvailable: true,
    gatewayRunning: false,
    gatewayHealthy: false,
    authenticated: false,
    homePath: "C:\\ProgramData\\SMC\\Hermes",
  };
}

function stubOwner(owner: HermesControlOwner): void {
  getControlOwnerMock.mockResolvedValue({ owner, source: "default" });
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: {
      getControlOwner: getControlOwnerMock,
    },
  });
}

function renderScreen(
  extras: {
    onReconnect?: ReturnType<typeof vi.fn>;
    onSelectHermesHome?: ReturnType<typeof vi.fn>;
  } = {},
): {
  onReconnect: ReturnType<typeof vi.fn>;
  onSelectHermesHome: ReturnType<typeof vi.fn>;
} {
  const onReconnect = extras.onReconnect ?? vi.fn();
  const onSelectHermesHome = extras.onSelectHermesHome ?? vi.fn();
  render(
    <ConnectionErrorScreen
      status={probe()}
      error="Gateway unreachable"
      onReconnect={onReconnect}
      onSelectHermesHome={onSelectHermesHome}
      onOpenLogs={vi.fn()}
      onOpenConnectionSettings={vi.fn()}
      onQuit={vi.fn()}
    />,
  );
  return { onReconnect, onSelectHermesHome };
}

describe("ConnectionErrorScreen Self-Install gate", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    getControlOwnerMock.mockReset();
  });

  it("hides Choose Hermes directory for managed-local-v1 with controlOwner=direct", async () => {
    stubOwner("direct");
    renderScreen();

    await waitFor(() => {
      expect(getControlOwnerMock).toHaveBeenCalled();
    });
    expect(screen.queryByRole("button", { name: "Choose Hermes directory" })).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(
      screen.queryByText(/Install or configure Hermes separately/i),
    ).toBeNull();
  });

  it("hides Choose Hermes directory for opsi and salt owners", async () => {
    stubOwner("opsi");
    const first = render(
      <ConnectionErrorScreen
        status={probe()}
        error={null}
        onReconnect={vi.fn()}
        onSelectHermesHome={vi.fn()}
        onOpenLogs={vi.fn()}
        onOpenConnectionSettings={vi.fn()}
        onQuit={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Choose Hermes directory" })).toBeNull();
    });
    first.unmount();

    stubOwner("salt");
    renderScreen();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Choose Hermes directory" })).toBeNull();
    });
  });

  it("Retry only reconnects and never selects a Hermes home", async () => {
    stubOwner("direct");
    const { onReconnect, onSelectHermesHome } = renderScreen();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(onSelectHermesHome).not.toHaveBeenCalled();
  });
});
