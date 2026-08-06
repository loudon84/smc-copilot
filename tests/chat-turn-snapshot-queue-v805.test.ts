import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createTurnSnapshot } from "../src/renderer/src/modules/chat/controller/chatTurnSnapshot";
import { useChatQueue } from "../src/renderer/src/modules/chat/hooks/useChatQueue";
import {
  chatReducer,
  createInitialChatState,
} from "../src/renderer/src/modules/chat/controller/chatReducer";
import type { ChatControllerState } from "../src/renderer/src/modules/chat/controller/chatViewTypes";

describe("chat turn snapshot queue retry (v8.0.5)", () => {
  it("queue retains attachments and expert/model in snapshot", () => {
    const { result } = renderHook(() => useChatQueue());
    const snap = createTurnSnapshot({
      turnId: "queued-1",
      rawText: "analyze this",
      effectiveText: "analyze this",
      attachments: [
        {
          id: "f1",
          name: "a.pdf",
          mimeType: "application/pdf",
        },
      ],
      sessionId: "sess-1",
      profileId: "default",
      modelId: "gpt-test",
      expertId: "exp-1",
      skillName: "research",
      workMode: "craft",
      permissionMode: "ask_each_time",
      invocationSource: "expert_chat",
      promptHintMode: "auto",
    });

    act(() => {
      result.current.enqueue(snap);
    });

    expect(result.current.queue).toHaveLength(1);
    const q = result.current.queue[0]!;
    expect(q.snapshot.attachments).toHaveLength(1);
    expect(q.snapshot.attachments[0]?.name).toBe("a.pdf");
    expect(q.snapshot.expertId).toBe("exp-1");
    expect(q.snapshot.modelId).toBe("gpt-test");
    expect(q.snapshot.skillName).toBe("research");
    expect(q.snapshot.workMode).toBe("craft");
  });

  it("does not enqueue empty text without attachments", () => {
    const { result } = renderHook(() => useChatQueue());
    act(() => {
      result.current.enqueue(
        createTurnSnapshot({
          turnId: "q",
          rawText: "  ",
          effectiveText: "",
          attachments: [],
          sessionId: null,
          profileId: "default",
          modelId: null,
          invocationSource: "default_chat",
        }),
      );
    });
    expect(result.current.queue).toHaveLength(0);
  });

  it("interaction submit marks pending; resolved clears submitting", () => {
    let state: ChatControllerState = {
      ...createInitialChatState("run-1"),
      activeTurnId: "turn-1",
      messages: [
        {
          id: "m1",
          kind: "clarify",
          request: {
            requestId: "req-1",
            question: "Which?",
            choices: ["A", "B"],
          },
          interactionStatus: "waiting",
        },
      ],
    };

    state = chatReducer(state, {
      type: "INTERACTION_SUBMIT",
      requestId: "req-1",
      turnId: "turn-1",
      interactionType: "clarify",
    });
    const clarify = state.messages.find((m) => m.kind === "clarify");
    expect(clarify?.kind === "clarify" && clarify.interactionStatus).toBe(
      "submitting",
    );

    state = chatReducer(state, {
      type: "INTERACTION_RESOLVED",
      requestId: "req-1",
      answer: "A",
    });
    const resolved = state.messages.find((m) => m.kind === "clarify");
    expect(resolved?.kind === "clarify" && resolved.interactionStatus).toBe(
      "resolved",
    );
  });

  it("interaction failed allows retry state", () => {
    let state: ChatControllerState = {
      ...createInitialChatState("run-1"),
      activeTurnId: "turn-1",
      messages: [
        {
          id: "m1",
          kind: "approval",
          request: {
            requestId: "req-2",
            toolName: "shell",
            summary: "run ls",
            riskLevel: "high",
          },
          interactionStatus: "submitting",
        },
      ],
    };

    state = chatReducer(state, {
      type: "INTERACTION_FAILED",
      requestId: "req-2",
      error: "GATEWAY_UNSUPPORTED",
    });
    const approval = state.messages.find((m) => m.kind === "approval");
    expect(approval?.kind === "approval" && approval.interactionStatus).toBe(
      "failed",
    );
  });
});
