// @vitest-environment jsdom
import { forwardRef } from "react";
import { cleanup, render, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteExpertSemanticEvent } from "../../../../shared/remote-expert";

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
  default: { error: vi.fn(), success: vi.fn() },
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

vi.mock("./ChatInput", () => ({
  ChatInput: forwardRef(function ChatInputMock() {
    return <div data-testid="chat-input" />;
  }),
}));

vi.mock("./hooks/useChatIPC", () => ({
  useChatIPC: () => undefined,
}));

vi.mock("./hooks/useChatActions", () => ({
  parseBackgroundCommand: () => null,
  useChatActions: () => ({
    handleSend: vi.fn(),
    handleQuickAsk: vi.fn(),
    handleBackground: vi.fn(),
    handleAbort: vi.fn(),
    handleApprove: vi.fn(),
    handleDeny: vi.fn(),
  }),
}));

vi.mock("./hooks/useModelConfig", () => ({
  effectiveOverrideBaseUrl: () => undefined,
  useModelConfig: () => ({
    providers: [],
    models: [],
    selectedModel: null,
    setSelectedModel: vi.fn(),
    sessionModelOverride: undefined,
    setSessionModelOverride: vi.fn(),
    chatCurrentModel: "",
    chatCurrentProvider: "",
    chatCurrentBaseUrl: "",
    modelGroups: [],
    displayModel: "",
    runtimeStatus: "",
    showRuntimeRefresh: false,
    refreshRuntime: vi.fn(),
    reload: vi.fn(),
    selectModel: vi.fn(),
  }),
}));

vi.mock("./hooks/useFastMode", () => ({
  useFastMode: () => ({ enabled: false, setEnabled: vi.fn(), toggle: vi.fn() }),
}));

vi.mock("./hooks/useReasoningEffort", () => ({
  useReasoningEffort: () => ({
    effort: "auto",
    setEffort: vi.fn(),
    reasoningEffort: "auto",
    setReasoningEffort: vi.fn(),
  }),
}));

vi.mock("./hooks/useLocalCommands", () => ({
  useLocalCommands: () => ({
    slashCatalog: [],
    localCommands: {},
  }),
}));

vi.mock("./hooks/useDashboardChatTransport", () => ({
  dashboardChatEnabledForConnection: () => false,
  knowledgeChatForcesLegacyTransport: () => false,
  useDashboardChatTransport: () => ({
    enabled: false,
    sendMessage: undefined,
    execSlash: undefined,
    runBackground: undefined,
    abort: undefined,
  }),
}));

vi.mock("../../components/ConfigHealthBanner", () => ({
  ConfigHealthBanner: () => null,
}));

vi.mock("../../components/files/FileServiceUnavailableBanner", () => ({
  FileServiceUnavailableBanner: () => null,
}));

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

let onEventHandler: ((event: RemoteExpertSemanticEvent) => void) | null = null;

function installHermes(): void {
  onEventHandler = null;
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
        enabled: true,
        gateState: "COMPATIBLE",
        packed: false,
      })),
      getSession: vi.fn(async () => null),
      onEvent: vi.fn((cb: (event: RemoteExpertSemanticEvent) => void) => {
        onEventHandler = cb;
        return () => undefined;
      }),
      listCatalog: vi.fn(async () => ({ items: [] })),
      submit: vi.fn(async () => undefined),
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

describe("Chat remote-expert tool upsert", () => {
  beforeEach(() => {
    resetSkillRunStoreForTests();
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    installHermes();
  });

  afterEach(() => {
    cleanup();
    resetSkillRunStoreForTests();
  });

  it("[A-SMC-002] [N-SMC-001] [F-SMC-003] upserts same toolCallId and keeps failed status", async () => {
    const sessionId = "desktop-tool-1";
    render(
      <Chat
        runId="run-tool-1"
        executionMode="remote-expert"
        initialSessionId={sessionId}
        remoteExpertAgentRef="sales-expert"
        initialMessages={[]}
      />,
    );
    await waitFor(() => expect(onEventHandler).toBeTruthy());

    await act(async () => {
      onEventHandler?.({
        type: "tool.call",
        sessionId,
        turnId: "turn-1",
        toolCallId: "tc-1",
        toolName: "search_files",
        title: "Search",
        status: "in_progress",
        rawInput: { q: "readme" },
      });
      onEventHandler?.({
        type: "tool.call",
        sessionId,
        turnId: "turn-1",
        toolCallId: "tc-1",
        toolName: "search_files",
        title: "Search",
        status: "in_progress",
        rawInput: { q: "readme", limit: 10 },
      });
      onEventHandler?.({
        type: "tool.result",
        sessionId,
        turnId: "turn-1",
        toolCallId: "tc-1",
        status: "completed",
        content: "ok",
      });
      onEventHandler?.({
        type: "tool.call",
        sessionId,
        turnId: "turn-1",
        toolCallId: "tc-fail",
        toolName: "terminal",
        status: "in_progress",
      });
      onEventHandler?.({
        type: "tool.result",
        sessionId,
        turnId: "turn-1",
        toolCallId: "tc-fail",
        status: "failed",
        errorCode: "TOOL_DENIED",
        errorMessage: "denied",
      });
    });

    await waitFor(() => {
      const cards = document.querySelectorAll(".chat-tool-item-name");
      expect(cards.length).toBeGreaterThanOrEqual(2);
    });
    const names = Array.from(
      document.querySelectorAll(".chat-tool-item-name"),
    ).map((el) => el.textContent);
    expect(names.filter((n) => /search/i.test(n || "")).length).toBe(1);
    expect(document.querySelector(".chat-tool-item-glyph--failed")).toBeTruthy();
    expect(document.body.textContent || "").toContain("TOOL_DENIED");
  });
});
