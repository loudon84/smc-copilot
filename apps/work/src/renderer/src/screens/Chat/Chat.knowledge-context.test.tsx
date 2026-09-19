// @vitest-environment jsdom
import { forwardRef, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: vi.fn(),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
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
  ChatInput: forwardRef(function ChatInputMock(props: {
    disabled?: boolean;
    toolbarExtras?: ReactNode;
  }) {
    return (
      <div data-testid="chat-input" data-disabled={String(!!props.disabled)}>
        {props.toolbarExtras}
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
  }),
}));

vi.mock("./hooks/useFastMode", () => ({
  useFastMode: () => ({ enabled: false, setEnabled: vi.fn() }),
}));

vi.mock("./hooks/useReasoningEffort", () => ({
  useReasoningEffort: () => ({
    effort: "auto",
    setEffort: vi.fn(),
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

vi.mock("./ModelPicker", () => ({
  ModelPicker: () => <div data-testid="model-picker" />,
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

vi.mock("../../modules/expert", () => ({
  ExpertContextControl: () => null,
  ExpertRunCard: () => null,
  ExpertArtifactCards: () => null,
  ensureExpertProjectionSubscription: () => undefined,
  getExpertProjectionsForSession: () => [],
  subscribeExpertProjections: () => () => undefined,
  upsertExpertProjection: () => undefined,
}));

import Chat from "./Chat";
import { resetSkillRunStoreForTests } from "../../modules/skill-run/store";

function installHermes(): void {
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
    expert: {
      rehydrateSession: vi.fn(async () => []),
      onProjectionChanged: vi.fn(() => () => undefined),
    },
  } as unknown as typeof window.hermesAPI;
  window.desktopAuth = {
    getState: vi.fn(async () => ({ user: { id: "u1" } })),
    onStateChanged: vi.fn(() => () => undefined),
  } as unknown as typeof window.desktopAuth;
}

describe("Chat knowledge props", () => {
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

  it("ordinary Chat with null context mounts unchanged", () => {
    render(<Chat runId="run-ordinary" profile="default" active />);
    expect(screen.getByTestId("chat-input")).toBeTruthy();
  });

  it("knowledgeRequired mounts knowledgeControl toolbar slot", () => {
    render(
      <Chat
        runId="run-kb"
        profile="default"
        active
        knowledgeRequired
        knowledgeContext={null}
        knowledgeControl={<span data-testid="kb-control">picker</span>}
      />,
    );
    expect(screen.getByTestId("kb-control")).toBeTruthy();
  });

  it("knowledgeSendBlocked mounts without crashing", () => {
    render(
      <Chat
        runId="run-blocked"
        profile="default"
        active
        knowledgeRequired
        knowledgeContext={{ version: "1.0", knowledgeSetId: "KS-A" }}
        knowledgeSendBlocked
        knowledgeSendBlockedReason="KNOWLEDGE_SET_NOT_ACTIVE"
      />,
    );
    expect(screen.getByTestId("chat-input")).toBeTruthy();
  });
});
