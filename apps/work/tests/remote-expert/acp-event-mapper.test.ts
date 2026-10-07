import { describe, expect, it } from "vitest";
import { mapAcpSessionUpdate } from "../../src/main/remote-expert/acp-event-mapper";

describe("acp-event-mapper", () => {
  it("[A-TL-MAPPER-001] maps top-level and nested sessionUpdate shapes", () => {
    const topLevel = mapAcpSessionUpdate({
      turnId: "t1",
      sessionId: "s1",
      params: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "hi" },
      },
    });
    expect(topLevel).toEqual([
      { type: "assistant.delta", turnId: "t1", text: "hi" },
    ]);

    const nested = mapAcpSessionUpdate({
      turnId: "t1",
      sessionId: "s1",
      params: {
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "nested" },
        },
      },
    });
    expect(nested).toEqual([
      { type: "assistant.delta", turnId: "t1", text: "nested" },
    ]);

    const nestedTool = mapAcpSessionUpdate({
      turnId: "t1",
      sessionId: "s1",
      params: {
        update: {
          sessionUpdate: "tool_call",
          toolCall: { toolCallId: "tc-1", title: "Search" },
        },
      },
    });
    expect(nestedTool).toEqual([
      {
        type: "tool.call",
        turnId: "t1",
        toolCallId: "tc-1",
        toolName: "Search",
        title: "Search",
      },
    ]);

    const nestedToolResult = mapAcpSessionUpdate({
      turnId: "t1",
      sessionId: "s1",
      params: {
        update: {
          sessionUpdate: "tool_call_update",
          toolCall: { toolCallId: "tc-1" },
          content: { type: "text", text: "done" },
        },
      },
    });
    expect(nestedToolResult).toEqual([
      {
        type: "tool.result",
        turnId: "t1",
        toolCallId: "tc-1",
        content: "done",
      },
    ]);

    const unknown = mapAcpSessionUpdate({
      turnId: "t1",
      sessionId: "s1",
      params: { update: { sessionUpdate: "future_kind_xyz" } },
    });
    expect(unknown).toEqual([]);
  });
});
