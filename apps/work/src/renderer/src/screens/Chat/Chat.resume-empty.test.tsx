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
import type { useChatIPC } from "./hooks/useChatIPC";
import type { useLocalCommands } from "./hooks/useLocalCommands";
type IpcHistory = Awaited<
  ReturnType<Window["hermesAPI"]["getSessionMessages"]>
>;

const probe = vi.hoisted(() => ({
  ipc: null as Parameters<typeof useChatIPC>[0] | null,
  commands: null as Parameters<typeof useLocalCommands>[0] | null,
  abort: vi.fn(async (): Promise<void> => undefined),
}));

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
    onAbort?: () => void;
  }) {
    return (
      <div data-testid="chat-input">
        <button onClick={props.onAbort}>Stop test run</button>
      </div>
    );
  }),
}));

vi.mock("./hooks/useChatIPC", () => ({
  useChatIPC: (args: Parameters<typeof useChatIPC>[0]) => {
    probe.ipc = args;
  },
}));

vi.mock("./hooks/useChatActions", () => ({
  parseBackgroundCommand: () => null,
  useChatActions: () => ({
    handleSend: vi.fn(),
    handleQuickAsk: vi.fn(),
    handleBackground: vi.fn(),
    handleAbort: probe.abort,
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
    reload: vi.fn(),
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
  useLocalCommands: (args: Parameters<typeof useLocalCommands>[0]) => {
    probe.commands = args;
    return { slashCatalog: [], localCommands: {} };
  },
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

describe("Chat resume empty vs new-chat empty", () => {
  beforeEach(() => {
    probe.abort.mockReset().mockResolvedValue(undefined);
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

  it("shows resume empty state when a session id is bound with no messages", () => {
    render(
      <Chat
        runId="run-1"
        initialSessionId="sess-chat"
        initialTitle="Report skills research dir"
        initialMessages={[]}
      />,
    );

    expect(screen.getByTestId("chat-resume-empty")).toBeTruthy();
    expect(screen.getByText("Report skills research dir")).toBeTruthy();
    expect(screen.queryByText("chat.suggestionSearch")).toBeNull();
  });

  it("shows new-chat suggestions when there is no session id", () => {
    render(<Chat runId="run-2" initialMessages={[]} />);

    expect(screen.queryByTestId("chat-resume-empty")).toBeNull();
    expect(screen.getByText("chat.suggestionSearch")).toBeTruthy();
  });

  it("does not fetch an already-loaded empty history a second time", async () => {
    await act(async () => {
      render(
        <Chat
          runId="loaded"
          initialSessionId="empty"
          initialMessages={[]}
          initialHistoryLoaded
        />,
      );
    });
    expect(window.hermesAPI.getSessionMessages).not.toHaveBeenCalled();
    expect(screen.getByTestId("chat-resume-empty")).toBeTruthy();
  });

  it("shows a readable retry failure without replacing the bound empty conversation", async () => {
    render(
      <Chat
        runId="retry-failure"
        initialSessionId="empty"
        initialMessages={[]}
        initialHistoryLoaded
      />,
    );
    vi.mocked(window.hermesAPI.getSessionMessages).mockRejectedValueOnce(
      new Error("offline"),
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "chat.resumeEmptyRetry" }),
      );
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "knowledge.chat.historyFailed",
    );
    expect(screen.getByTestId("chat-resume-empty")).toBeTruthy();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "chat.resumeEmptyRetry" }),
      );
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports running, waiting, completed and failed without treating visibility as termination", async () => {
    const activity = vi.fn();
    const props = { runId: "status", onActivityChange: activity };
    const view = render(<Chat {...props} />);
    act(() => {
      probe.ipc!.setIsLoading(true);
      probe.ipc!.setMessages([{ id: "u", role: "user", content: "question" }]);
    });
    expect(activity).toHaveBeenLastCalledWith("status", "running");
    view.rerender(<Chat {...props} active={false} />);
    expect(activity).toHaveBeenLastCalledWith("status", "running");
    act(() =>
      probe.ipc!.setMessages((previous) => [
        ...previous,
        {
          id: "ask",
          role: "agent",
          kind: "clarify",
          requestId: "req",
          question: "Choose",
          choices: ["yes"],
        },
      ]),
    );
    expect(activity).toHaveBeenLastCalledWith("status", "waiting");
    act(() => {
      probe.ipc!.setIsLoading(false);
      probe.ipc!.setMessages([{ id: "a", role: "agent", content: "done" }]);
    });
    expect(activity).toHaveBeenLastCalledWith("status", "completed");
    act(() =>
      probe.ipc!.setMessages([
        { id: "a", role: "agent", content: "", error: "failed" },
      ]),
    );
    expect(activity).toHaveBeenLastCalledWith("status", "failed");
  });

  it("keeps busy while Stop is pending, then reports stopped; errors keep the run busy", async () => {
    let finish!: () => void;
    probe.abort.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const activity = vi.fn();
    const loading = vi.fn();
    render(
      <Chat
        runId="stop"
        onActivityChange={activity}
        onLoadingChange={loading}
      />,
    );
    act(() => probe.ipc!.setIsLoading(true));
    fireEvent.click(screen.getByRole("button", { name: "Stop test run" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop test run" }));
    expect(probe.abort).toHaveBeenCalledOnce();
    expect(activity).toHaveBeenLastCalledWith("stop", "stopping");
    expect(loading).toHaveBeenLastCalledWith("stop", true);
    await act(async () => {
      probe.ipc!.setIsLoading(false);
      finish();
    });
    expect(activity).toHaveBeenLastCalledWith("stop", "stopped");
    expect(loading).toHaveBeenLastCalledWith("stop", false);
    act(() => probe.ipc!.setIsLoading(true));
    probe.abort.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Stop test run" }));
    });
    expect(activity).toHaveBeenLastCalledWith("stop", "running");
    expect(loading).toHaveBeenLastCalledWith("stop", true);
  });

  it.each(["mount", "retry"])(
    "keeps live output when a late %s history snapshot arrives",
    async (source) => {
      let resolveHistory!: (items: IpcHistory) => void;
      const pending = () =>
        new Promise<IpcHistory>((resolve) => {
          resolveHistory = resolve;
        });
      const read = vi.mocked(window.hermesAPI.getSessionMessages);
      if (source === "mount") read.mockImplementationOnce(pending);
      else read.mockResolvedValueOnce([]).mockImplementationOnce(pending);
      await act(async () => {
        render(<Chat runId="live" initialSessionId="session-a" />);
      });
      if (source === "retry") {
        await act(async () => {
          fireEvent.click(
            screen.getByRole("button", { name: "chat.resumeEmptyRetry" }),
          );
        });
      }
      act(() => {
        probe.ipc!.activeTurnRef.current = {
          turnId: "turn-new",
          userId: "user-new",
          startIndex: 0,
          status: "running",
        };
        probe.ipc!.setMessages([
          { id: "user-new", role: "user", content: "new question" },
          { id: "answer-new", role: "agent", content: "live answer" },
        ]);
      });
      await act(async () => {
        resolveHistory([
          { kind: "user", id: 1, content: "older question", timestamp: 1 },
        ]);
      });
      expect(
        screen.getByText("new question", { selector: ".chat-bubble" }),
      ).toBeTruthy();
      expect(screen.getByText("live answer")).toBeTruthy();
      expect(
        screen.getByText("older question", { selector: ".chat-bubble" }),
      ).toBeTruthy();
    },
  );

  it("does not reload history when a new chat first receives its session id", async () => {
    const view = render(<Chat runId="first-send" />);
    await act(async () => {
      probe.ipc!.setHermesSessionId("session-new");
    });
    view.rerender(<Chat runId="first-send" initialSessionId="session-new" />);
    expect(window.hermesAPI.getSessionMessages).not.toHaveBeenCalled();
  });

  it("ignores pending history after clearing the conversation", async () => {
    let resolveHistory!: (items: IpcHistory) => void;
    vi.mocked(window.hermesAPI.getSessionMessages).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveHistory = resolve;
        }),
    );
    render(<Chat runId="clear" initialSessionId="session-old" />);
    await waitFor(() => expect(resolveHistory).toBeTypeOf("function"));
    act(() => {
      probe.commands!.onClear();
    });
    await act(async () => {
      resolveHistory([
        { kind: "user", id: 1, content: "deleted history", timestamp: 1 },
      ]);
    });
    expect(screen.queryByText("deleted history")).toBeNull();
  });

  it("does not let the clear command delete a running conversation", () => {
    render(
      <Chat
        runId="clear-running"
        initialSessionId="active"
        initialHistoryLoaded
      />,
    );
    act(() => probe.ipc!.setIsLoading(true));
    act(() => probe.commands!.onClear());
    expect(window.hermesAPI.deleteSession).not.toHaveBeenCalled();
    expect(window.hermesAPI.abortChat).not.toHaveBeenCalled();
  });
});
