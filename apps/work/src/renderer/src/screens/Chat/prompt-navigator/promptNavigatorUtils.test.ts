import { describe, expect, it } from "vitest";
import {
  buildPromptNavigationItems,
  getPromptAnchorId,
  normalizePromptLabel,
  truncateLabel,
} from "./promptNavigatorUtils";
import type { ChatMessage } from "../types";

// @lat: [[prompt-navigator-tests#Prompt Navigator tests#Utils extract only user prompts]]
describe("promptNavigatorUtils", () => {
  it("extracts only user bubbles and ignores agent/history kinds", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "First prompt" },
      { id: "a1", role: "agent", content: "Agent reply" },
      { id: "r1", kind: "reasoning", role: "agent", text: "thinking" },
      {
        id: "t1",
        kind: "tool_call",
        role: "agent",
        callId: "c1",
        name: "bash",
        args: "{}",
      },
      {
        id: "cl1",
        kind: "clarify",
        role: "agent",
        requestId: "q1",
        question: "Which?",
        choices: ["A"],
      },
      { id: "u2", role: "user", content: "Second prompt" },
    ];

    const items = buildPromptNavigationItems(messages);
    expect(items.map((i) => i.messageId)).toEqual(["u1", "u2"]);
    expect(items.map((i) => i.sequence)).toEqual([1, 2]);
  });

  it("includes attachment-only prompts and skips empty ones", () => {
    const messages: ChatMessage[] = [
      {
        id: "att",
        role: "user",
        content: "   ",
        attachments: [
          {
            id: "f1",
            name: "a.png",
            kind: "image",
            mime: "image/png",
            size: 10,
          },
        ],
      },
      { id: "empty", role: "user", content: "  " },
    ];

    const items = buildPromptNavigationItems(messages);
    expect(items).toHaveLength(1);
    expect(items[0].messageId).toBe("att");
    expect(items[0].attachmentCount).toBe(1);
    expect(items[0].fullText).toMatch(/attachment/i);
  });

  it("normalizes markdown and truncates long labels", () => {
    expect(normalizePromptLabel("## Hello **world**")).toBe("Hello world");
    expect(normalizePromptLabel("see `code` and ```js\nx\n```")).toBe(
      "see code and [code]",
    );
    expect(truncateLabel("abcdefghij", 5)).toBe("abcd…");
    expect(truncateLabel("short", 72)).toBe("short");
  });

  it("builds run-scoped DOM anchor ids", () => {
    expect(getPromptAnchorId("run/1", "msg:2")).toBe(
      `chat-prompt-${encodeURIComponent("run/1")}-${encodeURIComponent("msg:2")}`,
    );
  });
});
