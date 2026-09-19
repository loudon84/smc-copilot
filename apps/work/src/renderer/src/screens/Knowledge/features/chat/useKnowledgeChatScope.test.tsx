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

  it("keeps READY when binding missing but route still has knowledgeSetId", async () => {
    getBinding.mockResolvedValue(null);
    const { result } = renderHook(() =>
      useKnowledgeChatScope({
        params: { sessionId: "pending", knowledgeSetId: "KS-A" },
        profile: "default",
      }),
    );
    await waitFor(() => {
      expect(result.current.phase).toBe("READY");
    });
    expect(result.current.selectedSetId).toBe("KS-A");
    expect(result.current.sessionId).toBe("pending");
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
