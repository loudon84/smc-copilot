import { describe, it, expect } from "vitest";
import {
  extractTaskHintsFromToolResult,
  taskHintsToRecentTask,
} from "../src/main/mcp-skill-gateway-runtime/hermes-structured-task";

describe("mcp structured task result", () => {
  it("extracts task_id and urls from structuredContent", () => {
    const hints = extractTaskHintsFromToolResult({
      structuredContent: {
        task_id: "task-uuid-1",
        event_token_url: "http://127.0.0.1:4510/events/task-uuid-1?token=abc",
        result_url: "http://127.0.0.1:4510/api/v1/hermes/tasks/task-uuid-1/result",
      },
    });
    expect(hints.taskId).toBe("task-uuid-1");
    expect(hints.eventTokenUrl).toContain("token=abc");
    expect(hints.resultUrl).toContain("task-uuid-1");
  });

  it("builds recent task entry from hints", () => {
    const recent = taskHintsToRecentTask(
      { taskId: "t1", resultUrl: "http://example/result" },
      { toolName: "hermes.write", agentAlias: "common-writer" },
    );
    expect(recent?.taskId).toBe("t1");
    expect(recent?.toolName).toBe("hermes.write");
    expect(recent?.agentAlias).toBe("common-writer");
  });
});
