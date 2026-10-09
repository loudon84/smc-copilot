// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useChatActions } from "./useChatActions";

afterEach(cleanup);

it.each([true, false])(
  "waits for the stop request before clearing the run (success=%s)",
  async (success) => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const abort = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    window.hermesAPI = {
      abortChat: vi.fn(() => abort),
    } as unknown as typeof window.hermesAPI;
    const args: Parameters<typeof useChatActions>[0] = {
      runId: "run-a",
      hermesSessionId: "session-a",
      messages: [],
      isLoading: true,
      setIsLoading: vi.fn(),
      setMessages: vi.fn(),
      chatInputRef: { current: null },
      localCommands: { executeLocal: vi.fn() },
      slashCatalog: {
        commands: [],
        byName: new Map(),
        aliases: new Map(),
        resolve: () => undefined,
      },
      activeTurnRef: {
        current: {
          turnId: "turn-a",
          userId: "user-a",
          startIndex: 0,
          status: "running",
        },
      },
      contextFolder: null,
    };
    const turn = args.activeTurnRef.current;
    const { result } = renderHook(() => useChatActions(args));
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.handleAbort();
    });
    expect(window.hermesAPI.abortChat).toHaveBeenCalledWith("run-a");
    expect(args.setIsLoading).not.toHaveBeenCalled();
    expect(args.activeTurnRef.current).toBe(turn);
    if (success) {
      await act(async () => {
        resolve();
        await pending;
      });
      expect(args.setIsLoading).toHaveBeenCalledWith(false);
      expect(args.activeTurnRef.current).toBeNull();
    } else {
      await act(async () => {
        reject(new Error("stop failed"));
        await expect(pending).rejects.toThrow("stop failed");
      });
      expect(args.setIsLoading).not.toHaveBeenCalled();
      expect(args.activeTurnRef.current).toBe(turn);
    }
  },
);
