import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChatController } from "../src/renderer/src/modules/chat/controller/useChatController";
import type { ChatRuntimePort } from "../src/renderer/src/modules/chat/ports/ChatRuntimePort";
import type { ChatSubmitInput } from "../src/shared/chat-runtime/chat-runtime-contract";
import type { ChatRuntimeEvent } from "../src/shared/chat-runtime/chat-runtime-events";

function createMockRuntime(): ChatRuntimePort & {
  lastSubmit: ChatSubmitInput | null;
  emit: (event: ChatRuntimeEvent) => void;
} {
  let listener: ((e: ChatRuntimeEvent) => void) | null = null;
  const api = {
    lastSubmit: null as ChatSubmitInput | null,
    emit(event: ChatRuntimeEvent) {
      listener?.(event);
    },
    async submit(input: ChatSubmitInput) {
      api.lastSubmit = input;
      return {
        ok: true as const,
        runId: input.runId,
        turnId: input.turnId,
        response: "ok",
        sessionId: "sess-from-submit",
      };
    },
    async abort() {
      return { ok: true as const };
    },
    onEvent(cb: (e: ChatRuntimeEvent) => void) {
      listener = cb;
      return () => {
        listener = null;
      };
    },
  };
  return api;
}

describe("composer submit transaction", () => {
  it("submitComposer clears input and draft before network returns", async () => {
    const runtime = createMockRuntime();
    const onDraftChange = vi.fn();

    const { result } = renderHook(() =>
      useChatController({
        runtime,
        profileId: "default",
        runId: "run-composer",
        onDraftChange,
      }),
    );

    act(() => {
      result.current.commitInput("hello composer");
    });
    expect(result.current.input).toBe("hello composer");

    let submitPromise: Promise<void> | undefined;
    act(() => {
      submitPromise = result.current.submitComposer();
    });

    // Cleared synchronously in the same turn as submit start
    expect(result.current.input).toBe("");
    expect(onDraftChange).toHaveBeenCalledWith("");

    await act(async () => {
      await submitPromise;
    });

    expect(runtime.lastSubmit?.message).toBe("hello composer");
    expect(runtime.lastSubmit?.turnId).toMatch(/^turn-/);
    expect(result.current.state.activeSessionId).toBe("sess-from-submit");
    expect(result.current.state.attachments).toEqual([]);
  });

  it("submitPayload with source composer clears attachments", async () => {
    const runtime = createMockRuntime();
    const { result } = renderHook(() =>
      useChatController({
        runtime,
        profileId: "default",
        runId: "run-attach",
      }),
    );

    act(() => {
      result.current.commitInput("with file");
    });

    await act(async () => {
      await result.current.submitPayload({
        text: "with file",
        attachments: [
          {
            id: "a1",
            name: "note.txt",
            mimeType: "text/plain",
            sizeBytes: 4,
          },
        ],
        source: "composer",
      });
    });

    expect(result.current.input).toBe("");
    expect(result.current.state.attachments).toEqual([]);
  });
});
