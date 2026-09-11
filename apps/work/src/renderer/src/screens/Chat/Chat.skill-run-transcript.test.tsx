// @vitest-environment jsdom
import { forwardRef } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillCatalogResponse, SkillRunProjection } from "../../../../shared/skill-run";
import type { ChatMessage } from "./types";

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

vi.mock("./ChatEmptyState", () => ({
  ChatEmptyState: () => null,
}));

vi.mock("./ChatInput", () => ({
  ChatInput: forwardRef(function ChatInputMock(
    props: { onSubmit: (text: string, attachments: unknown[]) => void },
    _ref,
  ) {
    return (
      <button type="button" onClick={() => props.onSubmit("Write the weekly report now", [])}>
        send-skill
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
  }),
}));

vi.mock("./hooks/useFastMode", () => ({
  useFastMode: () => ({ fastMode: false, toggle: vi.fn(), set: vi.fn() }),
}));

vi.mock("./hooks/useReasoningEffort", () => ({
  useReasoningEffort: () => ({
    reasoningEffort: "auto",
    setReasoningEffort: vi.fn(),
  }),
}));

vi.mock("./hooks/useLocalCommands", () => ({
  useLocalCommands: () => ({
    executeLocal: vi.fn(async () => false),
    isLocal: () => false,
  }),
}));

vi.mock("./hooks/useDashboardChatTransport", () => ({
  dashboardChatEnabledForConnection: () => false,
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

vi.mock("../../components/files", () => ({
  FilePreviewPanel: () => null,
}));

vi.mock("./session-files/SessionFilesPanel", () => ({
  SessionFilesPanel: () => null,
}));

vi.mock("./prompt-navigator/PromptNavigator", () => ({
  PromptNavigator: () => null,
}));

vi.mock("./WebPreviewPanel", () => ({
  WebPreviewPanel: () => null,
}));

vi.mock("./WorktreePanel", () => ({
  WorktreePanel: () => null,
}));

vi.mock("./RemoteFolderPicker", () => ({
  RemoteFolderPicker: () => null,
}));

vi.mock("./QueuedMessages", () => ({
  QueuedMessages: () => null,
}));

vi.mock("./ModelPicker", () => ({
  ModelPicker: () => null,
}));

vi.mock("./ReasoningEffortPicker", () => ({
  ReasoningEffortPicker: () => null,
}));

vi.mock("./ContextFolderChip", () => ({
  ContextFolderChip: () => null,
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
import {
  resetSkillRunStoreForTests,
  setSkillRunCatalogState,
  upsertSkillRunProjection,
} from "../../modules/skill-run/store";

const writerCatalog: SkillCatalogResponse = {
  status: "ready",
  tools: [
    {
      toolName: "writer",
      title: "Writer",
      interactionMode: "chat",
      promptField: "prompt",
      supportsAttachments: false,
      callability: "callable",
      invocationMode: "prompt-first",
    },
  ],
};

function projection(
  overrides: Partial<SkillRunProjection> = {},
): SkillRunProjection {
  return {
    clientRequestId: "req-1",
    providerRunId: "task-1",
    toolName: "writer",
    promptSummary: "summary",
    sessionId: "session-live",
    profileId: "default",
    phase: "running",
    displayStage: "Executing skill...",
    lastEventId: "evt-1",
    eventSeq: 1,
    createdAt: "t0",
    updatedAt: "t1",
    ...overrides,
  };
}

function installHermes(start: ReturnType<typeof vi.fn>): void {
  window.hermesAPI = {
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
      getFeatureMode: vi.fn(async () => ({ mode: "skill-first" })),
      getSessionMode: vi.fn(async () => ({
        executionMode: "skill-run",
        toolName: "writer",
        toolTitle: "Writer",
        updatedAt: "t0",
      })),
      rehydrateSession: vi.fn(async () => []),
      start,
      listCatalog: vi.fn(async () => writerCatalog),
      refreshCatalog: vi.fn(async () => writerCatalog),
      onProjectionChanged: vi.fn(() => () => undefined),
      cancel: vi.fn(async () => undefined),
      decideApproval: vi.fn(async () => undefined),
    },
    expert: {
      rehydrateSession: vi.fn(async () => []),
    },
  } as unknown as typeof window.hermesAPI;
  window.desktopAuth = {
    getState: vi.fn(async () => ({ user: { id: "u1" } })),
    onStateChanged: vi.fn(() => () => undefined),
  } as unknown as typeof window.desktopAuth;
}

describe("Chat skill-run transcript", () => {
  afterEach(() => {
    cleanup();
    resetSkillRunStoreForTests();
  });

  beforeEach(() => {
    resetSkillRunStoreForTests();
    setSkillRunCatalogState(writerCatalog);
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  it("shows user prompt and pending Native assistant before Main start resolves, then reject patches the same assistant", async () => {
    let resolveStart!: (value: { accepted: false; message: string }) => void;
    const start = vi.fn(
      () =>
        new Promise<{ accepted: false; message: string }>((resolve) => {
          resolveStart = resolve;
        }),
    );
    installHermes(start);
    render(
      <Chat
        runId="run-1"
        executionMode="skill-run"
        initialSessionId="session-live"
      />,
    );
    await screen.findByText("Writer");
    fireEvent.click(screen.getByText("send-skill"));
    expect(await screen.findByText("Write the weekly report now")).toBeTruthy();
    expect(await screen.findByText("Submitting skill request...")).toBeTruthy();
    expect(document.querySelectorAll(".skill-run-transcript-card")).toHaveLength(
      0,
    );
    expect(start).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveStart({ accepted: false, message: "Skill run rejected" });
    });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Skill run rejected");
    });
    expect(screen.getAllByText("Write the weekly report now")).toHaveLength(1);
    expect(document.querySelectorAll(".skill-run-transcript-card")).toHaveLength(
      0,
    );
  });

  it("upserts live A/A/B onto Native rows without a card or duplicated Prompt", async () => {
    installHermes(vi.fn(async () => ({ accepted: true })));
    const history: ChatMessage[] = [
      {
        id: "skill-run:req-a1:user",
        role: "user",
        content: "same prompt",
      },
      {
        id: "skill-run:req-a1",
        kind: "skill_run",
        role: "agent",
        clientRequestId: "req-a1",
        toolName: "writer",
        phase: "succeeded",
        displayStage: "Skill completed successfully",
        activities: [],
        pending: false,
        resultText: "done",
      },
    ];
    render(
      <Chat
        runId="run-hist"
        executionMode="skill-run"
        initialSessionId="session-live"
        initialMessages={history}
      />,
    );
    await screen.findByText("Writer");
    expect(screen.getAllByText("same prompt")).toHaveLength(1);

    act(() => {
      upsertSkillRunProjection(
        projection({
          clientRequestId: "req-a1",
          phase: "succeeded",
          text: "done",
          createdAt: "t0",
        }),
      );
      upsertSkillRunProjection(
        projection({
          clientRequestId: "req-a2",
          createdAt: "t1",
        }),
      );
      upsertSkillRunProjection(
        projection({
          clientRequestId: "req-b",
          toolName: "other",
          createdAt: "t2",
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText("done")).toBeTruthy();
    });
    expect(screen.getAllByText("same prompt")).toHaveLength(1);
    expect(document.querySelectorAll(".skill-run-transcript-card")).toHaveLength(
      0,
    );
  });
});
