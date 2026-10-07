// @vitest-environment jsdom
import { forwardRef } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { handleSend, toastError, remoteSubmit } = vi.hoisted(() => ({
  handleSend: vi.fn(),
  toastError: vi.fn(),
  remoteSubmit: vi.fn(),
}));

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: vi.fn(),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../runtime/use-runtime", () => ({
  useRuntimeOptional: () => null,
}));

vi.mock("react-hot-toast", () => ({
  default: { error: toastError, success: vi.fn() },
}));

vi.mock("./hooks/useChatScroll", () => ({
  useChatScroll: () => ({
    containerRef: { current: null },
    bottomRef: { current: null },
    scrollToNode: vi.fn(),
    pauseAutoScroll: vi.fn(),
    resumeAutoScroll: vi.fn(),
  }),
}));

vi.mock("./prompt-navigator/usePromptNavigator", () => ({
  usePromptNavigator: () => ({
    activePromptId: null,
    jumpToPrompt: vi.fn(),
  }),
}));

vi.mock("./ChatEmptyState", () => ({ ChatEmptyState: () => null }));
vi.mock("./ChatResumeEmptyState", () => ({ ChatResumeEmptyState: () => null }));

vi.mock("./ChatInput", () => ({
  ChatInput: forwardRef(function ChatInputMock(
    props: { onSubmit: (text: string, attachments: unknown[]) => void },
    _ref,
  ) {
    return (
      <button
        type="button"
        data-testid="send-remote"
        onClick={() => props.onSubmit("hello remote", [])}
      >
        send
      </button>
    );
  }),
}));

vi.mock("./hooks/useChatIPC", () => ({
  useChatIPC: () => undefined,
}));

vi.mock("./hooks/useChatActions", () => ({
  parseBackgroundCommand: () => null,
  useChatActions: () => ({
    handleSend,
    handleQuickAsk: vi.fn(),
    handleBackground: vi.fn(),
    handleAbort: vi.fn(),
    handleApprove: vi.fn(),
    handleDeny: vi.fn(),
  }),
}));

vi.mock("./hooks/useModelConfig", () => ({
  effectiveOverrideBaseUrl: () => "",
  useModelConfig: () => ({
    currentModel: "local",
    currentProvider: "auto",
    currentBaseUrl: "",
    modelGroups: [],
    displayModel: "local",
    reload: vi.fn(),
    selectModel: vi.fn(),
    composerPlaceholder: "",
    runtimeStatus: null,
    showRuntimeRefresh: false,
    refreshRuntime: vi.fn(),
    chatCurrentModel: "",
    chatCurrentProvider: "",
    chatCurrentBaseUrl: "",
  }),
}));

vi.mock("./hooks/useFastMode", () => ({
  useFastMode: () => ({ enabled: false, fastMode: false, toggle: vi.fn() }),
}));

vi.mock("./hooks/useReasoningEffort", () => ({
  useReasoningEffort: () => ({
    effort: "auto",
    reasoningEffort: "auto",
    setEffort: vi.fn(),
    setReasoningEffort: vi.fn(),
  }),
}));

vi.mock("./hooks/useLocalCommands", () => ({
  useLocalCommands: () => ({
    slashCatalog: [],
    localCommands: {},
    executeLocal: vi.fn(async () => false),
    isLocal: () => false,
  }),
}));

vi.mock("./hooks/useDashboardChatTransport", () => ({
  dashboardChatEnabledForConnection: () => false,
  knowledgeChatForcesLegacyTransport: () => false,
  useDashboardChatTransport: () => ({
    abort: vi.fn(),
    enabled: false,
    sendMessage: vi.fn(),
    execSlash: vi.fn(),
    getCommandCatalog: vi.fn(async () => ({ commands: [] })),
    runBackground: vi.fn(),
  }),
}));

vi.mock("../../hooks/files/useFilePreview", () => ({
  useFilePreview: () => ({
    state: { open: false, loading: false },
    openPreview: vi.fn(),
    openMessagePreview: vi.fn(),
    closePreview: vi.fn(),
    retry: vi.fn(),
    loadMore: vi.fn(),
  }),
}));

vi.mock("../../hooks/files/useDocumentPreview", () => ({
  useDocumentPreview: () => ({
    state: { open: false },
    open: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock("../../components/ConfigHealthBanner", () => ({
  ConfigHealthBanner: () => null,
}));
vi.mock("../../components/files/FileServiceUnavailableBanner", () => ({
  FileServiceUnavailableBanner: () => null,
}));
vi.mock("../../components/files", () => ({ FilePreviewPanel: () => null }));
vi.mock("./session-files/SessionFilesPanel", () => ({
  SessionFilesPanel: () => null,
}));
vi.mock("./prompt-navigator/PromptNavigator", () => ({
  PromptNavigator: () => null,
}));
vi.mock("./WebPreviewPanel", () => ({ WebPreviewPanel: () => null }));
vi.mock("./WorktreePanel", () => ({ WorktreePanel: () => null }));
vi.mock("./RemoteFolderPicker", () => ({ RemoteFolderPicker: () => null }));
vi.mock("./QueuedMessages", () => ({ QueuedMessages: () => null }));
vi.mock("./ModelPicker", () => ({ ModelPicker: () => null }));
vi.mock("./ReasoningEffortPicker", () => ({ ReasoningEffortPicker: () => null }));
vi.mock("./ContextFolderChip", () => ({ ContextFolderChip: () => null }));
vi.mock("../../modules/skill-run/SkillCatalogPanel", () => ({
  SkillCatalogPanel: () => null,
}));
vi.mock("../../modules/remote-expert/RemoteExpertContextControl", () => ({
  RemoteExpertContextControl: () => <div data-testid="remote-expert-control" />,
}));
vi.mock("../../modules/remote-expert/RemoteExpertPermissionCard", () => ({
  RemoteExpertPermissionCard: () => null,
}));
vi.mock("../../modules/remote-expert/RemoteExpertArtifactCards", () => ({
  RemoteExpertArtifactCards: () => null,
}));

import Chat from "./Chat";
import { resetSkillRunStoreForTests } from "../../modules/skill-run/store";

function installHermes(options?: {
  enabled?: boolean;
  submit?: typeof remoteSubmit;
  session?: {
    schemaVersion: 1;
    desktopSessionId: string;
    agentRef: string;
    acpSessionId: string;
    lastSeq: number;
    connectionState: "active" | "disconnected" | "closed" | "expired";
    updatedAt: number;
  } | null;
}) {
  window.hermesAPI = {
    getSessionMessages: vi.fn(async () => []),
    syncSessionCache: vi.fn(async () => []),
    getSessionContextFolder: vi.fn(async () => null),
    getConnectionConfig: vi.fn(async () => ({
      mode: "local",
      remoteUrl: "",
      remoteAuthMode: "auto",
    })),
    onConnectionConfigChanged: vi.fn(() => () => undefined),
    getSessionModelOverride: vi.fn(async () => null),
    validateChatReadiness: vi.fn(async () => ({ ok: true })),
    onContextMenuCopyChat: vi.fn(() => () => undefined),
    onContextMenuSelectBubble: vi.fn(() => () => undefined),
    getModelContextWindow: vi.fn(async () => null),
    copyToClipboard: vi.fn(),
    setSessionModelOverride: vi.fn(async () => undefined),
    setSessionContextFolder: vi.fn(async () => undefined),
    abortChat: vi.fn(),
    deleteSession: vi.fn(),
    clearStagedAttachments: vi.fn(),
    selectFolder: vi.fn(async () => null),
    probeRemoteAuthMode: vi.fn(async () => ({ authMode: "auto" })),
    skillRun: {
      getFeatureMode: vi.fn(async () => ({ mode: null })),
      getSessionMode: vi.fn(async () => null),
      rehydrateSession: vi.fn(async () => []),
      listCatalog: vi.fn(async () => ({ status: "ready", tools: [] })),
      refreshCatalog: vi.fn(async () => ({ status: "ready", tools: [] })),
      onProjectionChanged: vi.fn(() => () => undefined),
      cancel: vi.fn(async () => undefined),
      decideApproval: vi.fn(async () => undefined),
    },
    remoteExpert: {
      getAvailability: vi.fn(async () => ({
        enabled: options?.enabled ?? false,
        gateState: options?.enabled ? "COMPATIBLE" : "INCOMPATIBLE",
        packed: false,
      })),
      getSession: vi.fn(async () =>
        options?.session ?? null,
      ),
      onEvent: vi.fn(() => () => undefined),
      listCatalog: vi.fn(async () => ({ items: [] })),
      submit: options?.submit ?? remoteSubmit,
      cancel: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      resume: vi.fn(async () => null),
      decidePermission: vi.fn(async () => undefined),
    },
  } as unknown as typeof window.hermesAPI;
  window.desktopAuth = {
    getState: vi.fn(async () => ({ user: { id: "u1" } })),
    onStateChanged: vi.fn(() => () => undefined),
  } as unknown as typeof window.desktopAuth;
}

describe("Chat remote-expert hotfix routing", () => {
  beforeEach(() => {
    resetSkillRunStoreForTests();
    handleSend.mockReset();
    toastError.mockReset();
    remoteSubmit.mockReset();
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  afterEach(() => {
    cleanup();
    resetSkillRunStoreForTests();
  });

  it("[A-NEG-UI-001] blocks send when remote-expert mode and gate is off", async () => {
    installHermes({ enabled: false });
    render(
      <Chat
        runId="run-re-1"
        executionMode="remote-expert"
        remoteExpertAgentRef="sales-expert"
        initialMessages={[]}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("send-remote")).toBeTruthy());
    fireEvent.click(screen.getByTestId("send-remote"));
    expect(handleSend).not.toHaveBeenCalled();
    expect(remoteSubmit).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("chat.remoteExpert.gateUnavailable");
  });

  it("[A-NEG-PROMPT-001] marks the optimistic bubble failed when submit rejects", async () => {
    remoteSubmit.mockRejectedValue(new Error("ACP down"));
    installHermes({
      enabled: true,
      submit: remoteSubmit,
      session: {
        schemaVersion: 1,
        desktopSessionId: "sess-re",
        agentRef: "sales-expert",
        acpSessionId: "acp-1",
        lastSeq: 1,
        connectionState: "active",
        updatedAt: 1,
      },
    });
    render(
      <Chat
        runId="run-re-2"
        executionMode="remote-expert"
        initialSessionId="sess-re"
        initialMessages={[]}
      />,
    );
    await waitFor(() =>
      expect(window.hermesAPI.remoteExpert.getAvailability).toHaveBeenCalled(),
    );
    await waitFor(() => expect(screen.getByTestId("send-remote")).toBeTruthy());
    fireEvent.click(screen.getByTestId("send-remote"));
    await waitFor(() => expect(remoteSubmit).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("ACP down")).toBeTruthy());
    expect(handleSend).not.toHaveBeenCalled();
  });

  it("[A-SESSION-LOST-UI-001] maps binding-missing to sessionExpired toast/copy", async () => {
    remoteSubmit.mockRejectedValue(
      new Error(
        "Error invoking remote method 'remote-expert:submit': RemoteExpertError: prior runtime session binding missing",
      ),
    );
    installHermes({
      enabled: true,
      submit: remoteSubmit,
      session: {
        schemaVersion: 1,
        desktopSessionId: "sess-lost",
        agentRef: "marketing",
        acpSessionId: "acp-lost",
        lastSeq: 1,
        connectionState: "active",
        updatedAt: 1,
      },
    });
    render(
      <Chat
        runId="run-re-lost"
        executionMode="remote-expert"
        remoteExpertAgentRef="marketing"
        initialSessionId="sess-lost"
        initialMessages={[]}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("send-remote")).toBeTruthy());
    fireEvent.click(screen.getByTestId("send-remote"));
    await waitFor(() => expect(remoteSubmit).toHaveBeenCalled());
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("chat.remoteExpert.sessionExpired"),
    );
    await waitFor(() =>
      expect(screen.getByText("chat.remoteExpert.sessionExpired")).toBeTruthy(),
    );
    expect(screen.queryByText(/prior runtime session binding missing/i)).toBeNull();
  });

  it("[A-NEG-TL-ROUTE-001] hard-rejects a second submit while remoteExpertBusy", async () => {
    let resolveSubmit: (() => void) | undefined;
    remoteSubmit.mockImplementation(
      () =>
        new Promise<{ requestId: string; sessionId: string }>((resolve) => {
          resolveSubmit = () =>
            resolve({ requestId: "req", sessionId: "sess-busy" });
        }),
    );
    installHermes({
      enabled: true,
      submit: remoteSubmit,
      session: {
        schemaVersion: 1,
        desktopSessionId: "sess-busy",
        agentRef: "sales-expert",
        acpSessionId: "acp-1",
        lastSeq: 1,
        connectionState: "active",
        updatedAt: 1,
      },
    });
    render(
      <Chat
        runId="run-re-busy"
        executionMode="remote-expert"
        initialSessionId="sess-busy"
        initialMessages={[]}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("send-remote")).toBeTruthy());
    fireEvent.click(screen.getByTestId("send-remote"));
    await waitFor(() => expect(remoteSubmit).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId("send-remote"));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("chat.remoteExpert.turnInProgress"),
    );
    expect(remoteSubmit).toHaveBeenCalledTimes(1);
    resolveSubmit?.();
  });

  it("[A-TL-ROUTE-001] in-flight disconnect keeps streamed content and turn mapping", async () => {
    // Electron wraps handler errors — matcher must be unanchored.
    remoteSubmit.mockRejectedValue(
      new Error(
        "Error occurred in handler for 'remote-expert:submit': RemoteExpertError: IN_FLIGHT_DISCONNECTED: socket closed",
      ),
    );
    installHermes({
      enabled: true,
      submit: remoteSubmit,
      session: {
        schemaVersion: 1,
        desktopSessionId: "sess-inflight",
        agentRef: "sales-expert",
        acpSessionId: "acp-1",
        lastSeq: 1,
        connectionState: "active",
        updatedAt: 1,
      },
    });
    render(
      <Chat
        runId="run-re-inflight"
        executionMode="remote-expert"
        initialSessionId="sess-inflight"
        initialMessages={[]}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("send-remote")).toBeTruthy());
    fireEvent.click(screen.getByTestId("send-remote"));
    await waitFor(() => expect(remoteSubmit).toHaveBeenCalled());
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "chat.remoteExpert.connectionLost",
      ),
    );
    // Must not replace the optimistic bubble with the error string.
    expect(screen.queryByText(/IN_FLIGHT_DISCONNECTED/i)).toBeNull();
    expect(handleSend).not.toHaveBeenCalled();
  });
});
