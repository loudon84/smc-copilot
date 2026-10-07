import { describe, expect, it } from "vitest";
import { mapAcpSessionUpdate } from "../../src/main/remote-expert/acp-event-mapper";

const FORBIDDEN = [
  "runtime_session_id",
  "runtime_run_id",
  "executionCapability",
  "access_token",
  "refresh_token",
];

function assertNoForbidden(value: unknown): void {
  const raw = JSON.stringify(value);
  for (const key of FORBIDDEN) {
    expect(raw.includes(key)).toBe(false);
  }
}

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
        status: "in_progress",
        rawInput: undefined,
        redacted: undefined,
        truncated: undefined,
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
        status: "completed",
        content: "done",
        structuredContent: undefined,
        errorCode: undefined,
        errorMessage: undefined,
        redacted: undefined,
        truncated: undefined,
      },
    ]);

    const unknown = mapAcpSessionUpdate({
      turnId: "t1",
      sessionId: "s1",
      params: { update: { sessionUpdate: "future_kind_xyz" } },
    });
    expect(unknown).toEqual([]);
  });

  it("[A-SMC-2103] chunk appends as delta; agent_message is snapshot not delta", () => {
    const chunk = mapAcpSessionUpdate({
      turnId: "t-snap",
      sessionId: "s1",
      params: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hello" },
      },
    });
    expect(chunk).toEqual([
      { type: "assistant.delta", turnId: "t-snap", text: "Hello" },
    ]);

    const snap = mapAcpSessionUpdate({
      turnId: "t-snap",
      sessionId: "s1",
      params: {
        sessionUpdate: "agent_message",
        content: { type: "text", text: "Hello world" },
      },
    });
    expect(snap).toEqual([
      { type: "assistant.snapshot", turnId: "t-snap", text: "Hello world" },
    ]);
    assertNoForbidden(snap);
  });

  it("[A-SMC-001] [A-SMC-2104] maps rich tool.call / tool.result / failed / redacted fields", () => {
    const call = mapAcpSessionUpdate({
      turnId: "t-rich",
      sessionId: "s1",
      params: {
        sessionUpdate: "tool_call",
        toolCallId: "tc-rich",
        toolName: "search_files",
        title: "Search Files",
        status: "in_progress",
        rawInput: { query: "README", path: "/docs" },
        redacted: false,
        truncated: false,
      },
    });
    expect(call).toEqual([
      {
        type: "tool.call",
        turnId: "t-rich",
        toolCallId: "tc-rich",
        toolName: "search_files",
        title: "Search Files",
        status: "in_progress",
        rawInput: { query: "README", path: "/docs" },
        redacted: false,
        truncated: false,
      },
    ]);
    assertNoForbidden(call);

    const result = mapAcpSessionUpdate({
      turnId: "t-rich",
      sessionId: "s1",
      params: {
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-rich",
        status: "completed",
        content: "found 2 files",
        structuredContent: { files: ["a.md", "b.md"] },
        truncated: true,
      },
    });
    expect(result).toEqual([
      {
        type: "tool.result",
        turnId: "t-rich",
        toolCallId: "tc-rich",
        status: "completed",
        content: "found 2 files",
        structuredContent: { files: ["a.md", "b.md"] },
        errorCode: undefined,
        errorMessage: undefined,
        redacted: undefined,
        truncated: true,
      },
    ]);
    assertNoForbidden(result);

    const failed = mapAcpSessionUpdate({
      turnId: "t-rich",
      sessionId: "s1",
      params: {
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-fail",
        status: "failed",
        error: { code: "TOOL_DENIED", message: "permission denied" },
        redacted: true,
      },
    });
    expect(failed).toEqual([
      {
        type: "tool.result",
        turnId: "t-rich",
        toolCallId: "tc-fail",
        status: "failed",
        content: undefined,
        structuredContent: undefined,
        errorCode: "TOOL_DENIED",
        errorMessage: "permission denied",
        redacted: true,
        truncated: undefined,
      },
    ]);
    assertNoForbidden(failed);
  });
});
