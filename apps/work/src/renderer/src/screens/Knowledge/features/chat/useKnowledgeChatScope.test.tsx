// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useKnowledgeChatScope } from "./useKnowledgeChatScope";

describe("useKnowledgeChatScope", () => {
  const getBinding = vi.fn();
  const getSet = vi.fn();
  const listKb = vi.fn();
  const deleteSession = vi.fn();
  const onReplace = vi.fn();

  beforeEach(() => {
    getBinding.mockReset();
    getSet.mockReset();
    listKb.mockReset();
    deleteSession.mockReset();
    onReplace.mockReset();
    listKb.mockResolvedValue([]);
    deleteSession.mockResolvedValue(undefined);
    (
      window as unknown as {
        hermesAPI: Record<string, unknown>;
      }
    ).hermesAPI = {
      getSessionKnowledgeContext: getBinding,
      getSessionMessages: vi.fn(async () => []),
      listKbSetSessions: listKb,
      deleteSession,
      knowledgeJobs: { sets: { get: getSet, list: vi.fn() } },
    };
  });

  it("starts UNBOUND then READY after set select", () => {
    const { result } = renderHook(() =>
      useKnowledgeChatScope({
        params: {},
        profile: "default",
        onReplace,
      }),
    );
    expect(result.current.phase).toBe("UNBOUND");
    act(() => {
      result.current.selectSet("KS-A");
    });
    expect(result.current.phase).toBe("READY");
    expect(result.current.knowledgeContext).toEqual({
      version: "1.0",
      knowledgeSetId: "KS-A",
    });
    expect(onReplace).toHaveBeenCalledWith({
      page: "chat",
      params: { knowledgeSetId: "KS-A" },
    });
  });

  it("loads beyond 50 rows and keeps loaded rows when a later page fails", async () => {
    const rows = Array.from({ length: 125 }, (_, i) => ({
      id: `session-${i}`,
      title: `Conversation ${i}`,
    }));
    listKb.mockImplementation(async (_profile, limit) => rows.slice(0, limit));
    const { result } = renderHook(() =>
      useKnowledgeChatScope({ params: {}, profile: "default" }),
    );
    await waitFor(() => expect(result.current.kbSetSessions).toHaveLength(50));
    expect(result.current.sessionsHasMore).toBe(true);
    act(() => {
      result.current.loadMoreSessions();
      result.current.loadMoreSessions();
    });
    await waitFor(() => expect(result.current.kbSetSessions).toHaveLength(100));
    expect(listKb).toHaveBeenCalledTimes(2);
    listKb.mockRejectedValueOnce(new Error("offline"));
    act(() => result.current.loadMoreSessions());
    await waitFor(() => expect(result.current.sessionsError).toBe(true));
    expect(result.current.kbSetSessions).toHaveLength(100);
    await act(async () => {
      await result.current.reloadSessions();
    });
    expect(result.current.kbSetSessions).toHaveLength(125);
    expect(result.current.sessionsHasMore).toBe(false);
    expect(result.current.sessionsError).toBe(false);
    expect(listKb).toHaveBeenLastCalledWith("default", 151);
  });

  it("refreshes the loaded window on cache changes and unsubscribes on unmount", async () => {
    let changed!: Parameters<typeof window.hermesAPI.onSessionCacheChanged>[0];
    const unsubscribe = vi.fn();
    window.hermesAPI.onSessionCacheChanged = vi.fn((listener) => {
      changed = listener;
      return unsubscribe;
    });
    const rows = Array.from({ length: 70 }, (_, i) => ({
      id: `session-${i}`,
      title: "Old title",
    }));
    listKb.mockImplementation(async (_profile, limit) => rows.slice(0, limit));
    const { result, unmount } = renderHook(() =>
      useKnowledgeChatScope({ params: {}, profile: "default" }),
    );
    await waitFor(() => expect(result.current.kbSetSessions).toHaveLength(50));
    act(() => result.current.loadMoreSessions());
    await waitFor(() => expect(result.current.kbSetSessions).toHaveLength(70));
    rows[0] = { ...rows[0], title: "Updated title" };
    await act(async () => {
      changed({ sessionId: rows[0].id, reason: "updated" });
    });
    expect(result.current.kbSetSessions[0].title).toBe("Updated title");
    expect(result.current.kbSetSessions).toHaveLength(70);
    expect(listKb).toHaveBeenLastCalledWith("default", 101);
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
    const calls = listKb.mock.calls.length;
    changed({ sessionId: "late", reason: "created" });
    expect(listKb).toHaveBeenCalledTimes(calls);
  });

  it("keeps the list and the active conversation when history recovery fails, then retries", async () => {
    getBinding.mockResolvedValue({
      sessionId: "A",
      profileId: "default",
      sessionKind: "kb-set",
      knowledgeSetId: "KS-A",
    });
    getSet.mockResolvedValue({ status: "active" });
    listKb.mockResolvedValue([{ id: "A", title: "A" }]);
    vi.mocked(window.hermesAPI.getSessionMessages).mockRejectedValueOnce(
      new Error("offline"),
    );
    const { result } = renderHook(() =>
      useKnowledgeChatScope({ params: { sessionId: "A" }, profile: "default" }),
    );
    await waitFor(() =>
      expect(result.current.sendBlockedReason).toBe(
        "KNOWLEDGE_HISTORY_LOAD_FAILED",
      ),
    );
    expect(result.current.kbSetSessions).toHaveLength(1);
    expect(result.current.sendBlocked).toBe(true);
    const id = result.current.activeRunId;
    act(() => result.current.activateRun(id));
    await waitFor(() => expect(result.current.phase).toBe("BOUND"));
    expect(result.current.activeRunId).toBe(id);
  });

  it("resumes BOUND when kb-set row and active set exist", async () => {
    getBinding.mockResolvedValue({
      sessionId: "sess-1",
      profileId: "default",
      sessionKind: "kb-set",
      knowledgeSetId: "KS-A",
    });
    getSet.mockResolvedValue({ id: "KS-A", name: "A", status: "active" });

    const { result } = renderHook(() =>
      useKnowledgeChatScope({
        params: { sessionId: "sess-1" },
        profile: "default",
        onReplace,
      }),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("BOUND");
      expect(result.current.selectedSetId).toBe("KS-A");
    });
    expect(result.current.locked).toBe(true);
  });

  it("BLOCKED read-only when set is inactive", async () => {
    getBinding.mockResolvedValue({
      sessionId: "sess-1",
      profileId: "default",
      sessionKind: "kb-set",
      knowledgeSetId: "KS-A",
    });
    getSet.mockResolvedValue({ id: "KS-A", name: "A", status: "archived" });

    const { result } = renderHook(() =>
      useKnowledgeChatScope({
        params: { sessionId: "sess-1" },
        profile: "default",
      }),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("BLOCKED");
    });
    expect(result.current.sendBlocked).toBe(true);
    expect(result.current.sendBlockedReason).toBe("KNOWLEDGE_SET_NOT_ACTIVE");
    act(() => {
      result.current.selectSet("KS-B");
    });
    expect(result.current.selectedSetId).toBe("KS-A");
  });

  it("RESUME_BLOCKED when metadata missing", async () => {
    getBinding.mockResolvedValue(null);
    const { result } = renderHook(() =>
      useKnowledgeChatScope({
        params: { sessionId: "missing" },
        profile: "default",
      }),
    );
    await waitFor(() => {
      expect(result.current.phase).toBe("RESUME_BLOCKED");
    });
  });

  it("blocks a missing binding even when route carries a knowledgeSetId", async () => {
    getBinding.mockResolvedValue(null);
    const { result } = renderHook(() =>
      useKnowledgeChatScope({
        params: { sessionId: "pending", knowledgeSetId: "KS-A" },
        profile: "default",
      }),
    );
    await waitFor(() => {
      expect(result.current.phase).toBe("RESUME_BLOCKED");
    });
    expect(result.current.selectedSetId).toBe("KS-A");
    expect(result.current.sessionId).toBe("pending");
    expect(result.current.sendBlocked).toBe(true);
  });

  it("blocks sending until the requested session has finished loading its own history", async () => {
    getBinding.mockResolvedValue({
      sessionId: "A",
      profileId: "default",
      sessionKind: "kb-set",
      knowledgeSetId: "KS-A",
    });
    getSet.mockResolvedValue({ status: "active" });
    let finish!: () => void;
    vi.mocked(window.hermesAPI.getSessionMessages).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve([]);
        }),
    );
    const { result } = renderHook(() =>
      useKnowledgeChatScope({ params: { sessionId: "A" }, profile: "default" }),
    );
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(result.current.phase).toBe("RESOLVING");
    expect(result.current.sendBlocked).toBe(true);
    expect(result.current.runs[0].initialized).toBe(false);
    await act(async () => {
      finish();
    });
    expect(result.current.phase).toBe("BOUND");
    expect(result.current.runs[0].initialized).toBe(true);
  });

  it("ignores old-profile session-list results", async () => {
    let finish!: (rows: Array<{ id: string; title: string }>) => void;
    listKb
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce([{ id: "B", title: "Current profile" }]);
    const { result, rerender } = renderHook(
      ({ profile }) => useKnowledgeChatScope({ params: {}, profile }),
      { initialProps: { profile: "a" } },
    );
    rerender({ profile: "b" });
    await waitFor(() => expect(result.current.kbSetSessions[0]?.id).toBe("B"));
    await act(async () => {
      finish([{ id: "A", title: "Old profile" }]);
    });
    expect(result.current.kbSetSessions.map((row) => row.id)).toEqual(["B"]);
  });

  it("rejects deleting a running conversation before calling the API", async () => {
    const { result } = renderHook(() =>
      useKnowledgeChatScope({
        params: { knowledgeSetId: "KS-A" },
        profile: "default",
      }),
    );
    const id = result.current.activeRunId;
    act(() => result.current.onLoadingChange(id, true));
    await expect(result.current.deleteKbSetSession(id)).rejects.toThrow(
      "KNOWLEDGE_SESSION_RUNNING",
    );
    expect(deleteSession).not.toHaveBeenCalled();
    expect(result.current.runs).toHaveLength(1);
  });

  it("fails closed after a binding error and retries when reopening the same row", async () => {
    getBinding.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() =>
      useKnowledgeChatScope({ params: { sessionId: "A" }, profile: "default" }),
    );
    await waitFor(() => expect(result.current.phase).toBe("RESUME_BLOCKED"));
    expect(result.current.sendBlocked).toBe(true);
    expect(window.hermesAPI.getSessionMessages).not.toHaveBeenCalled();
    getBinding.mockResolvedValue({
      sessionId: "A",
      profileId: "default",
      sessionKind: "kb-set",
      knowledgeSetId: "KS-A",
    });
    getSet.mockResolvedValue({ status: "active" });
    act(() => result.current.openSession("A"));
    await waitFor(() => expect(result.current.phase).toBe("BOUND"));
  });

  it("unloads to UNBOUND on profile switch", async () => {
    getBinding.mockResolvedValue({
      sessionId: "sess-1",
      profileId: "default",
      sessionKind: "kb-set",
      knowledgeSetId: "KS-A",
    });
    getSet.mockResolvedValue({ id: "KS-A", name: "A", status: "active" });

    const { result, rerender } = renderHook(
      ({ profile }) =>
        useKnowledgeChatScope({
          params: { sessionId: "sess-1" },
          profile,
        }),
      { initialProps: { profile: "default" } },
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("BOUND");
    });

    getBinding.mockResolvedValue({
      sessionId: "sess-1",
      profileId: "default",
      sessionKind: "kb-set",
      knowledgeSetId: "KS-A",
    });

    rerender({ profile: "other" });
    await waitFor(() => {
      expect(
        result.current.phase === "UNBOUND" ||
          result.current.phase === "RESUME_BLOCKED",
      ).toBe(true);
    });
  });

  it("deleteKbSetSession removes current session and returns to UNBOUND", async () => {
    getBinding.mockResolvedValue({
      sessionId: "sess-1",
      profileId: "default",
      sessionKind: "kb-set",
      knowledgeSetId: "KS-A",
    });
    getSet.mockResolvedValue({ id: "KS-A", name: "A", status: "active" });
    listKb
      .mockResolvedValueOnce([
        {
          id: "sess-1",
          title: "Ask FAE",
          knowledgeSetId: "KS-A",
          sessionKind: "kb-set",
          executionProvider: "hermes-chat",
        },
      ])
      .mockResolvedValueOnce([]);

    const { result } = renderHook(() =>
      useKnowledgeChatScope({
        params: { sessionId: "sess-1" },
        profile: "default",
        onReplace,
      }),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("BOUND");
    });

    await act(async () => {
      await result.current.deleteKbSetSession("sess-1");
    });

    expect(deleteSession).toHaveBeenCalledWith("sess-1");
    expect(onReplace).toHaveBeenCalledWith({ page: "chat", params: {} });
    expect(result.current.phase).toBe("UNBOUND");
    await waitFor(() => {
      expect(result.current.kbSetSessions).toEqual([]);
    });
  });
});
