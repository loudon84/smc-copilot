import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionFilesSummary } from "../src/renderer/src/modules/chat/hooks/useSessionFilesSummary";
import type { ChatFilesChangedEvent } from "../src/shared/chat-files/chat-files-events";

type Listed = {
  id: string;
  name: string;
  category?: string;
};

describe("useSessionFilesSummary (v8.0.5)", () => {
  let listMock: ReturnType<typeof vi.fn>;
  let onChangedCb: ((e: ChatFilesChangedEvent) => void) | null;
  let prevChatFiles: unknown;

  beforeEach(() => {
    listMock = vi.fn();
    onChangedCb = null;
    prevChatFiles = (window as unknown as { chatFiles?: unknown }).chatFiles;
    (window as unknown as { chatFiles: unknown }).chatFiles = {
      listSessionFiles: listMock,
      onChanged: (cb: (e: ChatFilesChangedEvent) => void) => {
        onChangedCb = cb;
        return () => {
          onChangedCb = null;
        };
      },
    };
  });

  afterEach(() => {
    (window as unknown as { chatFiles?: unknown }).chatFiles = prevChatFiles;
  });

  it("loads total from listSessionFiles", async () => {
    listMock.mockResolvedValue([
      { id: "1", name: "a.pdf", category: "attachment" },
      { id: "2", name: "ctx.md", category: "context" },
      { id: "3", name: "out.txt", category: "agent_output" },
    ] as Listed[]);

    const { result } = renderHook(() =>
      useSessionFilesSummary({ sessionId: "sess-1", profileId: "default" }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.total).toBe(3);
    expect(result.current.attachments).toBe(1);
    expect(result.current.context).toBe(1);
    expect(result.current.agentOutput).toBe(1);
  });

  it("refreshes total after chat-files:changed", async () => {
    listMock
      .mockResolvedValueOnce([{ id: "1", name: "a.pdf" }] as Listed[])
      .mockResolvedValueOnce([
        { id: "1", name: "a.pdf" },
        { id: "2", name: "b.pdf" },
      ] as Listed[]);

    const { result } = renderHook(() =>
      useSessionFilesSummary({ sessionId: "sess-1", profileId: "default" }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.total).toBe(1);

    await act(async () => {
      onChangedCb?.({
        profileId: "default",
        sessionId: "sess-1",
        reason: "uploaded",
        fileId: "2",
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.total).toBe(2);
  });

  it("stays empty when sessionId is missing", async () => {
    const { result } = renderHook(() =>
      useSessionFilesSummary({ sessionId: null, profileId: "default" }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.total).toBe(0);
    expect(listMock).not.toHaveBeenCalled();
  });
});
