// @vitest-environment jsdom
import { forwardRef, type ReactNode } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../modules/remote-expert/entry-eligibility", () => ({
  isRemoteExpertEntryVisible: () => false,
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

vi.mock("./ChatEmptyState", () => ({ ChatEmptyState: () => null }));
vi.mock("./ChatResumeEmptyState", () => ({ ChatResumeEmptyState: () => null }));

vi.mock("./ChatInput", () => ({
  ChatInput: forwardRef(function ChatInputMock(
    props: { toolbarExtras?: ReactNode },
    _ref,
  ) {
    return <div data-testid="toolbar-extras">{props.toolbarExtras}</div>;
  }),
}));

vi.mock("./hooks/useChatIPC", () => ({ useChatIPC: () => undefined }));
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
import { expectRemoteExpertEntryVisible } from "./remote-expert-entry-assertions";
import { resetSkillRunStoreForTests } from "../../modules/skill-run/store";

describe("Chat remote-expert entry mutation", () => {
  beforeEach(() => {
    resetSkillRunStoreForTests();
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
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
        onEvent: vi.fn(() => () => undefined),
        listCatalog: vi.fn(async () => ({ items: [] })),
        submit: vi.fn(async () => ({ requestId: "t", sessionId: "s" })),
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
  });

  afterEach(() => {
    cleanup();
    resetSkillRunStoreForTests();
  });

  it("[A-NEG-TEST-ENTRY-001] required UI oracle fails when entry mount is forced off", async () => {
    render(<Chat runId="run-mut" executionMode="local-chat" />);
    await waitFor(() =>
      expect(window.hermesAPI.remoteExpert.getAvailability).toHaveBeenCalled(),
    );
    expect(() => expectRemoteExpertEntryVisible()).toThrow();
  });
});
