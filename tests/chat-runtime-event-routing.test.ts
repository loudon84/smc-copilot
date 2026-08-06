import { describe, expect, it } from "vitest";
import { processCustomEvent } from "../src/main/sse-parser";
import { chatRuntimeEventToActions } from "../src/renderer/src/modules/chat/controller/chatRuntimeEventReducer";

describe("chat-runtime event routing", () => {
  it("parses hermes reasoning / clarify / approval / tool.event SSE types", () => {
    const seen: string[] = [];
    processCustomEvent(
      "hermes.reasoning.delta",
      JSON.stringify({ content: "think" }),
      { onReasoningDelta: (c) => seen.push(`r:${c}`) },
    );
    processCustomEvent(
      "hermes.clarify.requested",
      JSON.stringify({ request_id: "c1", question: "Which?" }),
      { onClarifyRequested: (r) => seen.push(`c:${r.requestId}`) },
    );
    processCustomEvent(
      "hermes.approval.requested",
      JSON.stringify({
        request_id: "a1",
        tool_name: "shell",
        summary: "run rm",
      }),
      { onApprovalRequested: (r) => seen.push(`ap:${r.toolName}`) },
    );
    processCustomEvent(
      "hermes.tool.event",
      JSON.stringify({
        call_id: "t1",
        name: "search",
        status: "running",
      }),
      { onToolEvent: (e) => seen.push(`t:${e.callId}`) },
    );
    expect(seen).toEqual(["r:think", "c:c1", "ap:shell", "t:t1"]);
  });

  it("maps runtime events to controller actions without cross-talk", () => {
    const clarify = chatRuntimeEventToActions(
      {
        type: "clarify.requested",
        eventId: "e1",
        sequence: 1,
        emittedAt: 1,
        runId: "r1",
        turnId: "t1",
        request: { requestId: "c1", question: "Q?" },
      },
      null,
    );
    expect(clarify[0]?.type).toBe("APPEND_CLARIFY");

    const approval = chatRuntimeEventToActions(
      {
        type: "approval.requested",
        eventId: "e2",
        sequence: 2,
        emittedAt: 2,
        runId: "r1",
        turnId: "t1",
        request: { requestId: "a1", toolName: "x", summary: "y" },
      },
      null,
    );
    expect(approval[0]?.type).toBe("APPEND_APPROVAL");
  });
});
