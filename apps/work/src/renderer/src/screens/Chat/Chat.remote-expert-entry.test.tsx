// @vitest-environment jsdom
import { forwardRef, type ReactNode } from "react";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { handleSend, toastError, remoteSubmit, listCatalog, getAvailability } =
  vi.hoisted(() => ({
    handleSend: vi.fn(),
    toastError: vi.fn(),
    remoteSubmit: vi.fn(async () => ({ requestId: "t1", sessionId: "s1" })),
    listCatalog: vi.fn(),
    getAvailability: vi.fn(),
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
    props: {
      onSubmit: (text: string, attachments: unknown[]) => void;
      toolbarExtras?: ReactNode;
    },
    _ref,
  ) {
    return (
      <div>
        <div data-testid="toolbar-extras">{props.toolbarExtras}</div>
        <button
          type="button"
          data-testid="send-remote"
          onClick={() => props.onSubmit("hello remote", [])}
        >
          send
        </button>
      </div>
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
vi.mock("../../modules/remote-expert/RemoteExpertPermissionCard", () => ({
  RemoteExpertPermissionCard: () => null,
}));
vi.mock("../../modules/remote-expert/RemoteExpertArtifactCards", () => ({
  RemoteExpertArtifactCards: () => null,
}));

import Chat from "./Chat";
import { resetSkillRunStoreForTests } from "../../modules/skill-run/store";
import { expectRemoteExpertEntryVisible } from "./remote-expert-entry-assertions";

const salesItem = {
  agentRef: "sales-expert",
  displayName: "Sales Expert",
  description: null,
  category: "sales",
  tags: [] as string[],
  avatar: null,
  status: "ready" as const,
  capabilities: {
    acp: { protocolVersion: 1 as const, remoteTransport: true },
    sessionResume: true,
    attachments: "resource_link",
    artifacts: "resource_link",
    permissions: true,
  },
};

function installHermes(options?: {
  availability?: {
    enabled: boolean;
    gateState: "UNRESOLVED" | "DISCOVERED" | "COMPATIBLE" | "INCOMPATIBLE";
    packed?: boolean;
    reason?: string;
    errorCode?: string;
  };
  availabilityImpl?: () => Promise<unknown>;
  catalogItems?: typeof salesItem[];
  catalogError?: Error;
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
  getAvailability.mockReset();
  listCatalog.mockReset();
  if (options?.availabilityImpl) {
    getAvailability.mockImplementation(options.availabilityImpl);
  } else {
    getAvailability.mockResolvedValue(
      options?.availability ?? {
        enabled: true,
        gateState: "COMPATIBLE",
        packed: false,
      },
    );
  }
  if (options?.catalogError) {
    listCatalog.mockRejectedValue(options.catalogError);
  } else {
    listCatalog.mockResolvedValue({
      items: options?.catalogItems ?? [salesItem],
    });
  }
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
      getAvailability,
      getSession: vi.fn(async () => options?.session ?? null),
      onEvent: vi.fn(() => () => undefined),
      listCatalog,
      submit: remoteSubmit,
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

describe("Chat remote-expert entry (real components)", () => {
  beforeEach(() => {
    resetSkillRunStoreForTests();
    handleSend.mockReset();
    toastError.mockReset();
    remoteSubmit.mockReset();
    remoteSubmit.mockResolvedValue({ requestId: "t1", sessionId: "s1" });
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

  it("[A-TEST-ENTRY-001] does not mock RemoteExpertContextControl or Selector", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      join(here, "Chat.remote-expert-entry.test.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(
      /vi\.mock\(\s*["']\.\.\/\.\.\/modules\/remote-expert\/RemoteExpertContextControl["']/,
    );
    expect(source).not.toMatch(
      /vi\.mock\(\s*["']\.\.\/\.\.\/modules\/remote-expert\/RemoteExpertSelector["']/,
    );
  });

  it("[A-UI-ENTRY-001] shows enabled Remote Expert entry when gate is compatible", async () => {
    installHermes({
      availability: { enabled: true, gateState: "COMPATIBLE", packed: false },
      catalogItems: [salesItem],
    });
    render(<Chat runId="run-1" executionMode="local-chat" />);
    await waitFor(() => expect(getAvailability).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listCatalog).toHaveBeenCalledTimes(1));
    expectRemoteExpertEntryVisible();
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(
      false,
    );
  });

  it("[A-NEG-UI-ENTRY-001] keeps entry visible/disabled and skips catalog when unavailable", async () => {
    installHermes({
      availability: {
        enabled: false,
        gateState: "UNRESOLVED",
        packed: false,
        errorCode: "REMOTE_EXPERT_DISCOVERY_UNAVAILABLE",
      },
    });
    render(<Chat runId="run-2" executionMode="local-chat" />);
    await waitFor(() => expect(getAvailability).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.getByTitle("chat.remoteExpert.unavailableEntry"),
      ).toBeTruthy(),
    );
    expectRemoteExpertEntryVisible();
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(
      true,
    );
    expect(listCatalog).not.toHaveBeenCalled();
  });

  it("[A-NEG-UI-ENTRY-002] hides entry for Knowledge Chat and Skill Run", async () => {
    installHermes();
    const knowledge = render(
      <Chat runId="run-k" executionMode="local-chat" knowledgeRequired />,
    );
    await waitFor(() => expect(getAvailability).toHaveBeenCalled());
    expect(screen.queryByRole("combobox")).toBeNull();
    knowledge.unmount();

    render(<Chat runId="run-s" executionMode="skill-run" />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("[A-NEG-CATALOG-GATE-001] incompatible gate never lists catalog", async () => {
    installHermes({
      availability: {
        enabled: false,
        gateState: "INCOMPATIBLE",
        packed: false,
        errorCode: "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
      },
    });
    render(<Chat runId="run-3" executionMode="local-chat" />);
    await waitFor(() =>
      expect(screen.getByTitle("chat.remoteExpert.incompatible")).toBeTruthy(),
    );
    expect(listCatalog).toHaveBeenCalledTimes(0);
  });

  it("[A-CATALOG-GATE-001] loads catalog after compatible", async () => {
    installHermes({
      availability: { enabled: true, gateState: "COMPATIBLE", packed: false },
      catalogItems: [salesItem],
    });
    render(<Chat runId="run-4" executionMode="local-chat" />);
    await waitFor(() => expect(listCatalog).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("option", { name: "Sales Expert" })).toBeTruthy();
  });

  it("[A-CATALOG-EMPTY-001] shows empty diagnostic", async () => {
    installHermes({
      availability: { enabled: true, gateState: "COMPATIBLE", packed: false },
      catalogItems: [],
    });
    render(<Chat runId="run-5" executionMode="local-chat" />);
    await waitFor(() =>
      expect(screen.getByTitle("chat.remoteExpert.noExperts")).toBeTruthy(),
    );
  });

  it("[A-STATE-AVAIL-001] unavailable gate greys selector and skips catalog (retry covered in hook unit)", async () => {
    installHermes({
      availabilityImpl: async () => {
        throw new Error("bridge down");
      },
      catalogItems: [salesItem],
    });
    render(<Chat runId="run-6" executionMode="local-chat" />);
    await waitFor(() =>
      expect(
        screen.getByTitle("chat.remoteExpert.unavailableEntry"),
      ).toBeTruthy(),
    );
    expect(listCatalog).not.toHaveBeenCalled();
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(
      true,
    );
  });

  it("[A-NEG-STATE-AVAIL-001] compatible catalog stays enabled once listed", async () => {
    installHermes({
      availability: { enabled: true, gateState: "COMPATIBLE", packed: false },
      catalogItems: [salesItem],
    });
    render(<Chat runId="run-7" executionMode="local-chat" />);
    await waitFor(() => expect(listCatalog).toHaveBeenCalled());
    expect(screen.queryByTitle("chat.remoteExpert.incompatible")).toBeNull();
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(
      false,
    );
  });

  it("[A-ROUTE-REMOTE-001] remote mode submit only calls remoteExpert.submit", async () => {
    installHermes({
      availability: { enabled: true, gateState: "COMPATIBLE", packed: false },
      catalogItems: [salesItem],
    });
    render(
      <Chat
        runId="run-8"
        executionMode="remote-expert"
        remoteExpertAgentRef="sales-expert"
      />,
    );
    await waitFor(() => expect(listCatalog).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("send-remote"));
    await waitFor(() => expect(remoteSubmit).toHaveBeenCalledTimes(1));
    expect(handleSend).not.toHaveBeenCalled();
  });

  it("[A-ROUTE-LOCAL-001] local mode still sends when remote unavailable", async () => {
    installHermes({
      availability: {
        enabled: false,
        gateState: "UNRESOLVED",
        packed: false,
        errorCode: "REMOTE_EXPERT_DISCOVERY_UNAVAILABLE",
      },
    });
    render(<Chat runId="run-9" executionMode="local-chat" />);
    await waitFor(() => expect(getAvailability).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("send-remote"));
    expect(handleSend).toHaveBeenCalledTimes(1);
    expect(remoteSubmit).not.toHaveBeenCalled();
  });

  it("[A-NEG-ROUTE-FALLBACK-001] [A-MIG-2102] remote mode with gate failure does not fall back", async () => {
    installHermes({
      availability: {
        enabled: false,
        gateState: "INCOMPATIBLE",
        packed: false,
        errorCode: "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
      },
    });
    render(
      <Chat
        runId="run-10"
        executionMode="remote-expert"
        remoteExpertAgentRef="sales-expert"
      />,
    );
    await waitFor(() => expect(getAvailability).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("send-remote"));
    expect(handleSend).not.toHaveBeenCalled();
    expect(remoteSubmit).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("chat.remoteExpert.gateUnavailable");
  });

  it("[A-NEG-UI-SWITCH-002] durable session agent_ref wins over scratch", async () => {
    installHermes({
      availability: { enabled: true, gateState: "COMPATIBLE", packed: false },
      catalogItems: [salesItem],
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
        runId="run-11"
        executionMode="remote-expert"
        initialSessionId="sess-re"
        remoteExpertAgentRef="stale-expert"
      />,
    );
    await waitFor(() => expect(listCatalog).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("send-remote"));
    await waitFor(() => expect(remoteSubmit).toHaveBeenCalled());
    expect(remoteSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ agentRef: "sales-expert" }),
    );
  });

  it("[A-NEG-SEC-CLOSURE-003] visible entry does not bypass contract gate on send", async () => {
    installHermes({
      availability: {
        enabled: false,
        gateState: "INCOMPATIBLE",
        packed: false,
        errorCode: "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
      },
    });
    render(
      <Chat
        runId="run-12"
        executionMode="remote-expert"
        remoteExpertAgentRef="sales-expert"
      />,
    );
    await waitFor(() => expectRemoteExpertEntryVisible());
    fireEvent.click(screen.getByTestId("send-remote"));
    expect(remoteSubmit).not.toHaveBeenCalled();
  });
});
