import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModelConfig } from "./useModelConfig";

vi.mock("../../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: { code?: string }) =>
      params && "code" in params ? `${key}:${params.code}` : key,
  }),
}));

interface SavedModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  createdAt: number;
  providerRef?: string;
}

function Harness(): React.JSX.Element {
  const { modelGroups } = useModelConfig();
  const labels = modelGroups.flatMap((group) =>
    group.models.map((model) => model.label),
  );
  return <output data-testid="models">{JSON.stringify(labels)}</output>;
}

// Exposes the grouping shape (header brand + each model's routing provider) so a
// test can assert brand grouping without changing routing.
function GroupHarness(): React.JSX.Element {
  const { modelGroups } = useModelConfig();
  const shape = modelGroups.map((g) => ({
    provider: g.provider,
    label: g.providerLabel,
    models: g.models.map((m) => ({ model: m.model, provider: m.provider })),
  }));
  return <output data-testid="groups">{JSON.stringify(shape)}</output>;
}

describe("useModelConfig", () => {
  let configuredModels: SavedModel[];
  let emitModelLibraryChanged: (() => void) | null;

  beforeEach(() => {
    configuredModels = [
      {
        id: "codex-gpt-55",
        name: "Codex CLI GPT-5.5",
        provider: "codex-cli",
        model: "gpt-5.5",
        baseUrl: "",
        createdAt: 1,
      },
    ];
    emitModelLibraryChanged = null;

    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        getModelConfig: vi.fn(async () => ({
          provider: "codex-cli",
          model: "gpt-5.5",
          baseUrl: "",
        })),
        listModels: vi.fn(async () => configuredModels),
        onConnectionConfigChanged: vi.fn(() => vi.fn()),
        onModelLibraryChanged: vi.fn((callback: () => void) => {
          emitModelLibraryChanged = callback;
          return vi.fn();
        }),
        setModelConfig: vi.fn(async () => true),
      },
    });
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "hermesAPI");
  });

  it("lists only the active enterprise models", async () => {
    configuredModels = [
      {
        id: "local-1",
        name: "Local",
        provider: "openai",
        model: "gpt-4",
        baseUrl: "",
        createdAt: 1,
      },
      {
        id: "nodeskclaw:enterprise-a",
        name: "Enterprise A",
        provider: "nodeskclaw",
        model: "enterprise-a",
        baseUrl: "https://models.example.test/v1",
        createdAt: 2,
        providerRef: "named:nodeskclaw",
      } as SavedModel,
    ];
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        getModelConfig: vi.fn(async () => ({
          provider: "nodeskclaw",
          model: "enterprise-a",
          baseUrl: "",
        })),
        listModels: vi.fn(async () => configuredModels),
        getRuntimeProviderState: vi.fn(async () => ({
          state: "ACTIVE",
          modelIds: ["enterprise-a"],
        })),
        onConnectionConfigChanged: vi.fn(() => vi.fn()),
        onModelLibraryChanged: vi.fn(() => vi.fn()),
        setModelConfig: vi.fn(async () => true),
      },
    });

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByTestId("models")).toHaveTextContent("Enterprise A");
      expect(screen.getByTestId("models")).not.toHaveTextContent("Local");
    });
  });

  it("reloads the chat picker when the model library changes", async () => {
    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByTestId("models")).toHaveTextContent(
        "Codex CLI GPT-5.5",
      );
    });

    configuredModels = [
      ...configuredModels,
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        provider: "deepseek",
        model: "deepseek-v4-pro",
        baseUrl: "",
        createdAt: 2,
      },
    ];

    await act(async () => {
      emitModelLibraryChanged?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId("models")).toHaveTextContent("DeepSeek V4 Pro");
    });
  });

  it("groups a custom SMC Copilot model under the SMC Copilot brand while keeping custom routing", async () => {
    configuredModels = [
      {
        id: "hs-swift",
        name: "hermesone-swift",
        provider: "custom",
        model: "hermesone-swift",
        baseUrl: "http://llm.superic.com:3900/v1",
        createdAt: 1,
      },
    ];

    render(<GroupHarness />);

    await waitFor(() => {
      const groups = JSON.parse(
        screen.getByTestId("groups").textContent || "[]",
      );
      const hs = groups.find(
        (g: { label: string }) => g.label === "SMC Copilot",
      );
      expect(hs).toBeTruthy();
      // Not lumped under the generic OpenAI-compatible bucket.
      expect(hs.provider).toBe("hermesone");
      // Routing stays on `custom` + the base URL so the request still resolves.
      expect(hs.models[0]).toEqual({
        model: "hermesone-swift",
        provider: "custom",
      });
    });
  });

  it("collapses configured models that share provider, id, and base URL", async () => {
    configuredModels = [
      {
        id: "flash-a",
        name: "deepseek-v4-flash",
        provider: "custom",
        model: "deepseek-v4-flash",
        baseUrl: "http://llm.superic.com:3900/v1",
        createdAt: 1,
      },
      {
        id: "flash-b",
        name: "deepseek-v4-flash",
        provider: "custom",
        model: "deepseek-v4-flash",
        baseUrl: "http://llm.superic.com:3900/v1/",
        createdAt: 2,
      },
    ];

    render(<GroupHarness />);

    await waitFor(() => {
      const groups = JSON.parse(
        screen.getByTestId("groups").textContent || "[]",
      );
      expect(groups).toHaveLength(1);
      expect(groups[0].models).toEqual([
        { model: "deepseek-v4-flash", provider: "custom" },
      ]);
    });
  });

  it("keeps local models in the composer when enterprise sync is not ready", async () => {
    configuredModels = [
      {
        id: "local",
        name: "deepseek-v4-pro",
        provider: "custom",
        model: "deepseek-v4-pro",
        baseUrl: "http://127.0.0.1:3000/v1",
        createdAt: 1,
        providerRef: "named:localhost",
      },
      {
        id: "enterprise",
        name: "enterprise-a",
        provider: "nodeskclaw",
        model: "enterprise-a",
        baseUrl: "",
        createdAt: 2,
        providerRef: "named:nodeskclaw",
      },
    ];
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        getModelConfig: vi.fn(async () => ({
          provider: "custom",
          model: "deepseek-v4-pro",
          baseUrl: "http://127.0.0.1:3000/v1",
        })),
        listModels: vi.fn(async () => configuredModels),
        getRuntimeProviderState: vi.fn(async () => ({
          state: "NOT_READY",
          backendState: "MODEL_LIST_EMPTY",
          modelIds: [],
        })),
        onConnectionConfigChanged: vi.fn(() => vi.fn()),
        onModelLibraryChanged: vi.fn(() => vi.fn()),
        onRuntimeProviderStateChanged: vi.fn(() => vi.fn()),
        refreshRuntimeProvider: vi.fn(async () => ({ state: "NOT_READY" })),
        setModelConfig: vi.fn(async () => true),
      },
    });
    function LocalComposerHarness(): React.JSX.Element {
      const config = useModelConfig("default");
      const labels = config.modelGroups.flatMap((group) =>
        group.models.map((model) => model.label),
      );
      return (
        <output data-testid="composer">
          {`${labels.join(",")}|${config.runtimeStatus}|${config.showRuntimeRefresh}`}
        </output>
      );
    }
    render(<LocalComposerHarness />);
    await waitFor(() => {
      expect(screen.getByTestId("composer").textContent).toBe(
        "deepseek-v4-pro||false",
      );
    });
  });

  it("keeps local models when enterprise bootstrap is unreachable", async () => {
    configuredModels = [
      {
        id: "local",
        name: "deepseek-v4-pro",
        provider: "custom",
        model: "deepseek-v4-pro",
        baseUrl: "http://127.0.0.1:3000/v1",
        createdAt: 1,
        providerRef: "named:localhost",
      },
    ];
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        getModelConfig: vi.fn(async () => ({
          provider: "custom",
          model: "deepseek-v4-pro",
          baseUrl: "http://127.0.0.1:3000/v1",
        })),
        listModels: vi.fn(async () => configuredModels),
        getRuntimeProviderState: vi.fn(async () => ({
          state: "ERROR",
          errorCode: "RUNTIME_BOOTSTRAP_UNAVAILABLE",
          modelIds: [],
        })),
        onConnectionConfigChanged: vi.fn(() => vi.fn()),
        onModelLibraryChanged: vi.fn(() => vi.fn()),
        onRuntimeProviderStateChanged: vi.fn(() => vi.fn()),
        setModelConfig: vi.fn(async () => true),
      },
    });
    function LocalComposerHarness(): React.JSX.Element {
      const config = useModelConfig("default");
      const labels = config.modelGroups.flatMap((group) =>
        group.models.map((model) => model.label),
      );
      return (
        <output data-testid="composer">
          {`${labels.join(",")}|${config.runtimeStatus}|${config.showRuntimeRefresh}`}
        </output>
      );
    }
    render(<LocalComposerHarness />);
    await waitFor(() => {
      expect(screen.getByTestId("composer").textContent).toBe(
        "deepseek-v4-pro||false",
      );
    });
  });

  it("does not put the unbound enterprise status in the composer", async () => {
    function StatusHarness(): React.JSX.Element {
      const config = useModelConfig();
      return (
        <output data-testid="composer-status">{config.runtimeStatus}</output>
      );
    }
    render(<StatusHarness />);
    await waitFor(() => {
      expect(screen.getByTestId("composer-status").textContent).toBe("");
    });
  });

  it("loads the local picker from the profile model catalog", async () => {
    render(<Harness />);
    await waitFor(() => {
      expect(window.hermesAPI.listModels).toHaveBeenCalled();
    });
  });

  it("reloads only the current profile and shows refresh for failed states", async () => {
    let emit: ((event: {
      profile: string;
      state: string;
      modelIds?: string[];
      backendState?: string | null;
      errorCode?: string | null;
      revision?: string | null;
      providerRef?: string | null;
      defaultModel?: string | null;
      modelCount?: number;
    }) => void) | null = null;
    const listModels = vi.fn(async () => configuredModels);
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        getModelConfig: vi.fn(async () => ({
          provider: "openai",
          model: "gpt-4",
          baseUrl: "",
        })),
        listModels,
        getRuntimeProviderState: vi.fn(async () => ({ state: "ERROR", errorCode: "RUNTIME_GATEWAY_RESTART_FAILED" })),
        onConnectionConfigChanged: vi.fn(() => vi.fn()),
        onModelLibraryChanged: vi.fn(() => vi.fn()),
        onRuntimeProviderStateChanged: vi.fn((callback) => {
          emit = callback;
          return vi.fn();
        }),
        refreshRuntimeProvider: vi.fn(async () => ({ state: "ACTIVE" })),
        setModelConfig: vi.fn(async () => true),
      },
    });
    function StatusHarness(): React.JSX.Element {
      const config = useModelConfig("default");
      return (
        <output data-testid="status">
          {`${config.runtimeStatus}|${config.showRuntimeRefresh}|${config.modelGroups.length}`}
        </output>
      );
    }
    render(<StatusHarness />);
    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toContain("true");
    });
    const calls = listModels.mock.calls.length;
    act(() => emit?.({ profile: "research", state: "UNBOUND" }));
    expect(listModels.mock.calls.length).toBe(calls);
    act(() =>
      emit?.({
        profile: "default",
        state: "ACTIVE",
        modelIds: [],
        backendState: null,
        errorCode: null,
        revision: "rev",
        providerRef: "named:nodeskclaw",
        defaultModel: "enterprise-a",
        modelCount: 0,
      }),
    );
    await waitFor(() => {
      expect(listModels.mock.calls.length).toBeGreaterThan(calls);
    });
  });

  async function expectRuntimePresentation(
    state: {
      state: string;
      backendState?: string | null;
      errorCode?: string | null;
      modelIds?: string[];
    },
    expected: string,
  ): Promise<void> {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        getModelConfig: vi.fn(async () => ({
          provider: "nodeskclaw",
          model: "",
          baseUrl: "",
        })),
        listModels: vi.fn(async () => []),
        getRuntimeProviderState: vi.fn(async () => state),
        onConnectionConfigChanged: vi.fn(() => vi.fn()),
        onModelLibraryChanged: vi.fn(() => vi.fn()),
        onRuntimeProviderStateChanged: vi.fn(() => vi.fn()),
        setModelConfig: vi.fn(async () => true),
      },
    });
    function PresentationHarness(): React.JSX.Element {
      const config = useModelConfig();
      return (
        <output data-testid="presentation">
          {`${config.currentProvider}|${config.runtimeStatus}|${config.showRuntimeRefresh}|${config.composerPlaceholder}`}
        </output>
      );
    }
    render(<PresentationHarness />);
    await waitFor(() => {
      expect(screen.getByTestId("presentation").textContent).toBe(expected);
    });
  }

  it("hides the ready status when enterprise models are active", async () => {
    await expectRuntimePresentation(
      { state: "ACTIVE", modelIds: ["enterprise-a"] },
      "nodeskclaw||false|",
    );
  });

  it("puts the empty model list in the composer placeholder", async () => {
    await expectRuntimePresentation(
      {
        state: "NOT_READY",
        backendState: "MODEL_LIST_EMPTY",
        modelIds: [],
      },
      "nodeskclaw||false|chat.runtimeProvider.modelListEmpty",
    );
  });

  it("falls back when the not-ready backend state is unknown", async () => {
    await expectRuntimePresentation(
      { state: "NOT_READY", backendState: "SOMETHING_ELSE", modelIds: [] },
      "nodeskclaw||false|chat.runtimeProvider.modelSyncNotReady",
    );
    cleanup();
    await expectRuntimePresentation(
      { state: "NOT_READY", modelIds: [] },
      "nodeskclaw||false|chat.runtimeProvider.modelSyncNotReady",
    );
  });

  it("keeps the toolbar error and puts the code in the placeholder", async () => {
    await expectRuntimePresentation(
      {
        state: "ERROR",
        errorCode: "RUNTIME_GATEWAY_RESTART_FAILED",
        modelIds: [],
      },
      "nodeskclaw|chat.runtimeProvider.error:RUNTIME_GATEWAY_RESTART_FAILED|true|chat.runtimeProvider.error:RUNTIME_GATEWAY_RESTART_FAILED",
    );
  });

  it("puts an unreachable bootstrap in the placeholder without a toolbar status", async () => {
    await expectRuntimePresentation(
      {
        state: "ERROR",
        errorCode: "RUNTIME_BOOTSTRAP_UNAVAILABLE",
        modelIds: [],
      },
      "nodeskclaw||false|chat.runtimeProvider.error:RUNTIME_BOOTSTRAP_UNAVAILABLE",
    );
  });

  it("keeps stale active on the toolbar and the default placeholder", async () => {
    await expectRuntimePresentation(
      { state: "STALE_ACTIVE", modelIds: [] },
      "nodeskclaw|chat.runtimeProvider.staleActive:|true|",
    );
  });

  it("leaves the placeholder empty when the runtime is unbound", async () => {
    function PlaceholderHarness(): React.JSX.Element {
      const config = useModelConfig();
      return (
        <output data-testid="placeholder">{config.composerPlaceholder}</output>
      );
    }
    render(<PlaceholderHarness />);
    await waitFor(() => {
      expect(screen.getByTestId("placeholder").textContent).toBe("");
    });
  });
});
