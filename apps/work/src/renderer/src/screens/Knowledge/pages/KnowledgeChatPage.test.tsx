// @vitest-environment jsdom
import { useEffect, useState, type ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import knowledgeEn from "../../../../../shared/i18n/locales/en/knowledge";

vi.mock("../../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string, values: Record<string, string> = {}) => {
      const path = key.replace("knowledge.chat.", "").split(".");
      const value = path.reduce<unknown>(
        (node, part) =>
          node && typeof node === "object"
            ? (node as Record<string, unknown>)[part]
            : undefined,
        knowledgeEn.chat,
      );
      const text = typeof value === "string" ? value : key;
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => values[name] ?? "");
    },
  }),
}));

const live = vi.hoisted(
  () =>
    new Map<
      string,
      {
        bind: (id: string) => void;
        loading: (value: boolean) => void;
        chunk: (value: string) => void;
      }
    >(),
);

vi.mock("../../Chat/Chat", () => ({
  default: (props: {
    active?: boolean;
    initialSessionId?: string | null;
    runId: string;
    knowledgeRequired?: boolean;
    knowledgeContext?: { knowledgeSetId: string } | null;
    knowledgeControl?: ReactNode;
    knowledgeSendBlocked?: boolean;
    onSessionIdChange?: (runId: string, id: string | null) => void;
    onLoadingChange?: (runId: string, value: boolean) => void;
    onNewChat?: () => void;
  }) => {
    const [sessionId, bind] = useState(props.initialSessionId ?? null);
    const [draft, setDraft] = useState("");
    const [running, loading] = useState(false);
    const [text, chunk] = useState("");
    useEffect(() => {
      live.set(props.runId, { bind, loading, chunk });
      return () => {
        live.delete(props.runId);
      };
    }, [props.runId]);
    useEffect(() => {
      props.onSessionIdChange?.(props.runId, sessionId);
    }, [props.runId, sessionId, props.onSessionIdChange]);
    useEffect(() => {
      props.onLoadingChange?.(props.runId, running);
    }, [props.runId, running, props.onLoadingChange]);
    useEffect(() => {
      if (!props.active) return;
      const onKey = (event: KeyboardEvent) => {
        if (event.ctrlKey && event.key === "n") props.onNewChat?.();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [props.active, props.onNewChat]);
    return (
      <div
        data-testid="shared-chat"
        data-active={String(props.active)}
        data-run-id={props.runId}
        data-session-id={sessionId ?? ""}
        data-set-id={props.knowledgeContext?.knowledgeSetId ?? ""}
        data-knowledge-required={String(props.knowledgeRequired)}
        data-blocked={String(props.knowledgeSendBlocked)}
      >
        <input
          aria-label="draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <output>{text}</output>
        {props.knowledgeControl}
      </div>
    );
  },
}));

vi.mock("../../Chat/knowledge/KnowledgeConnector", () => ({
  KnowledgeConnector: () => <div data-testid="knowledge-connector" />,
}));

import { KnowledgeChatPage } from "./KnowledgeChatPage";

const binding = (id: string) => ({
  sessionId: id,
  profileId: "default",
  sessionKind: "kb-set" as const,
  executionProvider: "hermes-chat" as const,
  knowledgeSetId: "KS-A",
});
const activeChat = () =>
  screen
    .getAllByTestId("shared-chat")
    .find((el) => el.dataset.active === "true")!;
const runId = (el = activeChat()) => el.dataset.runId!;
const open = (title: string) =>
  fireEvent.click(screen.getByRole("button", { name: title }));

describe("KnowledgeChatPage conversation lifetime", () => {
  beforeEach(() => {
    window.hermesAPI = {
      listKbSetSessions: vi.fn(async () => [
        { id: "A", title: "Session A" },
        { id: "B", title: "Session B" },
        { id: "C", title: "Session C" },
      ]),
      getSessionKnowledgeContext: vi.fn(async (id: string) => binding(id)),
      getSessionMessages: vi.fn(async () => []),
      deleteSession: vi.fn(async () => undefined),
      knowledgeJobs: {
        sets: {
          list: vi.fn(async () => ({ items: [] })),
          get: vi.fn(async () => ({ status: "active" })),
        },
      },
    } as unknown as typeof window.hermesAPI;
  });
  afterEach(() => {
    cleanup();
    live.clear();
    vi.restoreAllMocks();
  });

  it("mounts one Shared Chat with the selected knowledge set", () => {
    render(<KnowledgeChatPage params={{ knowledgeSetId: "KS-A" }} />);
    expect(activeChat().dataset.knowledgeRequired).toBe("true");
    expect(activeChat().dataset.setId).toBe("KS-A");
  });

  it("exposes more than 50 saved conversations and a retry that preserves existing rows", async () => {
    const rows = Array.from({ length: 61 }, (_, i) => ({
      ...binding(`saved-${i}`),
      id: `saved-${i}`,
      title: `Saved ${i}`,
      startedAt: i,
    }));
    vi.mocked(window.hermesAPI.listKbSetSessions).mockImplementation(
      async (_profile, limit) => rows.slice(0, limit),
    );
    render(<KnowledgeChatPage />);
    await screen.findByRole("button", { name: "Saved 49" });
    expect(screen.queryByRole("button", { name: "Saved 50" })).toBeNull();
    vi.mocked(window.hermesAPI.listKbSetSessions).mockRejectedValueOnce(
      new Error("offline"),
    );
    open(knowledgeEn.chat.loadMore);
    await screen.findByText(knowledgeEn.chat.listFailed);
    expect(screen.getByRole("button", { name: "Saved 0" })).toBeTruthy();
    open(knowledgeEn.chat.retry);
    await screen.findByRole("button", { name: "Saved 60" });
    expect(
      screen.queryByRole("button", { name: knowledgeEn.chat.loadMore }),
    ).toBeNull();
    expect(screen.queryByText(knowledgeEn.chat.listFailed)).toBeNull();
  });

  it("explains missing bindings and recovers the same selected session on explicit retry", async () => {
    vi.mocked(window.hermesAPI.getSessionKnowledgeContext).mockRejectedValue(
      new Error("offline"),
    );
    render(<KnowledgeChatPage params={{ sessionId: "A" }} />);
    await screen.findByText(knowledgeEn.chat.serviceUnavailable);
    expect(screen.getByRole("button", { name: "Session B" })).toBeTruthy();
    vi.mocked(window.hermesAPI.getSessionKnowledgeContext).mockResolvedValue(
      binding("A"),
    );
    open(knowledgeEn.chat.retryConversation);
    await waitFor(() => expect(activeChat()?.dataset.sessionId).toBe("A"));
    expect(screen.queryByText(knowledgeEn.chat.serviceUnavailable)).toBeNull();
  });

  it("keeps an unsent draft when opening another conversation and returning", async () => {
    render(<KnowledgeChatPage params={{ knowledgeSetId: "KS-A" }} />);
    const original = runId();
    fireEvent.change(within(activeChat()).getByLabelText("draft"), {
      target: { value: "unsent text" },
    });
    open("New knowledge chat");
    expect(runId()).not.toBe(original);
    fireEvent.click(screen.getAllByRole("button", { name: "Unsent draft" })[0]);
    expect(runId()).toBe(original);
    expect(within(activeChat()).getByLabelText("draft")).toHaveValue(
      "unsent text",
    );
    expect(live.size).toBe(2);
  });

  it("opens B with B's identity and returns to the same live A instance", async () => {
    const replace = vi.fn();
    render(
      <KnowledgeChatPage params={{ sessionId: "A" }} onReplace={replace} />,
    );
    await waitFor(() => expect(activeChat()?.dataset.sessionId).toBe("A"));
    const original = runId();
    act(() => live.get(original)!.loading(true));
    open("Session B");
    await waitFor(() => expect(activeChat()?.dataset.sessionId).toBe("B"));
    expect(replace).toHaveBeenLastCalledWith({
      page: "chat",
      params: { sessionId: "B" },
    });
    act(() => live.get(original)!.chunk("A continues in background"));
    open("Session A");
    expect(runId()).toBe(original);
    expect(activeChat()).toHaveTextContent("A continues in background");
    expect(
      screen.getByRole("button", { name: "Delete Session A" }),
    ).toBeDisabled();
    expect(live.size).toBe(2);
  });

  it("binds the first session id without remounting or fetching old history", async () => {
    const replace = vi.fn();
    render(
      <KnowledgeChatPage
        params={{ knowledgeSetId: "KS-A" }}
        onReplace={replace}
      />,
    );
    const original = runId();
    fireEvent.change(within(activeChat()).getByLabelText("draft"), {
      target: { value: "next question" },
    });
    act(() => {
      live.get(original)!.loading(true);
      live.get(original)!.bind("A");
    });
    await waitFor(() => expect(activeChat().dataset.blocked).toBe("false"));
    expect(runId()).toBe(original);
    expect(within(activeChat()).getByLabelText("draft")).toHaveValue(
      "next question",
    );
    expect(window.hermesAPI.getSessionMessages).not.toHaveBeenCalled();
    expect(replace).toHaveBeenLastCalledWith({
      page: "chat",
      params: { sessionId: "A", knowledgeSetId: "KS-A" },
    });
  });

  it("a background first-send callback cannot select its conversation again", async () => {
    const replace = vi.fn();
    render(
      <KnowledgeChatPage
        params={{ knowledgeSetId: "KS-A" }}
        onReplace={replace}
      />,
    );
    const original = runId();
    open("New knowledge chat");
    const next = runId();
    replace.mockClear();
    await act(async () => live.get(original)!.bind("A"));
    expect(runId()).toBe(next);
    expect(replace).not.toHaveBeenCalled();
    open("Session A");
    await waitFor(() => expect(activeChat().dataset.blocked).toBe("false"));
    expect(runId()).toBe(original);
  });

  it("ignores a late binding response after selecting a newer session", async () => {
    let finishB!: (value: ReturnType<typeof binding>) => void;
    vi.mocked(window.hermesAPI.getSessionKnowledgeContext).mockImplementation(
      async (id) =>
        id === "B"
          ? await new Promise<ReturnType<typeof binding>>((resolve) => {
              finishB = resolve;
            })
          : binding(id),
    );
    const replace = vi.fn();
    render(
      <KnowledgeChatPage params={{ sessionId: "A" }} onReplace={replace} />,
    );
    await waitFor(() => expect(activeChat()?.dataset.sessionId).toBe("A"));
    open("Session B");
    expect(screen.getByRole("status")).toHaveTextContent("Restoring");
    open("Session C");
    await waitFor(() => expect(activeChat()?.dataset.sessionId).toBe("C"));
    await act(async () => {
      finishB(binding("B"));
    });
    expect(activeChat().dataset.sessionId).toBe("C");
    expect(window.hermesAPI.getSessionMessages).not.toHaveBeenCalledWith("B");
    expect(replace).toHaveBeenLastCalledWith({
      page: "chat",
      params: { sessionId: "C" },
    });
  });

  it("disables hidden shortcuts while retaining the same Chat instance", async () => {
    const props = { params: { knowledgeSetId: "KS-A" } };
    const view = render(<KnowledgeChatPage {...props} />);
    const original = runId();
    view.rerender(<KnowledgeChatPage {...props} active={false} />);
    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    expect(live.size).toBe(1);
    view.rerender(<KnowledgeChatPage {...props} />);
    expect(runId()).toBe(original);
  });

  it("replaces the workspace when profile changes without showing old Chat state", () => {
    const view = render(
      <KnowledgeChatPage params={{ knowledgeSetId: "KS-A" }} />,
    );
    const original = runId();
    view.rerender(
      <KnowledgeChatPage params={{ knowledgeSetId: "KS-A" }} profile="other" />,
    );
    expect(runId()).not.toBe(original);
    expect(live.has(original)).toBe(false);
    expect(live.size).toBe(1);
  });
});
