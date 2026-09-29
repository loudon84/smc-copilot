import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AuxiliaryTasksSection from "./AuxiliaryTasksSection";

vi.mock("./useI18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("../hooks/useDiscoveredModels", () => ({
  useDiscoveredModels: () => ({ models: [], loading: false, error: null }),
}));

function installApi(state: string) {
  (window as unknown as { hermesAPI: unknown }).hermesAPI = {
    getAuxiliaryConfig: async () => [
      { task: "vision", provider: "auto", model: "", baseUrl: "" },
    ],
    getConnectionConfig: async () => ({ mode: "local" }),
    getRuntimeProviderState: async () => ({ state }),
    onConnectionConfigChanged: () => () => undefined,
    onRuntimeProviderStateChanged: () => () => undefined,
    setAuxiliaryTask: vi.fn(),
    resetAuxiliaryConfig: vi.fn(),
  };
}

describe("auxiliary tasks while enterprise runtime is managed", () => {
  it("disables route changes while the local runtime is active", async () => {
    installApi("ACTIVE");
    render(<AuxiliaryTasksSection visible />);
    expect(await screen.findByText("providers.auxiliary.managed")).toBeTruthy();
    const buttons = screen.getAllByRole("button");
    expect(buttons.every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  });

  it("keeps route changes when the runtime is unbound", async () => {
    installApi("UNBOUND");
    render(<AuxiliaryTasksSection visible />);
    expect(screen.queryByText("providers.auxiliary.managed")).toBeNull();
    const buttons = await screen.findAllByRole("button");
    expect(buttons.some((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
  });
});
