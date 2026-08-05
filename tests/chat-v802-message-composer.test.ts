import { describe, expect, it } from "vitest";
import {
  orderToolActivityItems,
  toolActivityGroupTitle,
} from "../src/renderer/src/modules/chat/components/messages/HistoryRows";
import type { ChatViewItem } from "../src/renderer/src/modules/chat/controller/chatViewTypes";
import { chatRuntimeEventToActions } from "../src/renderer/src/modules/chat/controller/chatRuntimeEventReducer";
import { chatReducer, createInitialChatState } from "../src/renderer/src/modules/chat/controller/chatReducer";
import { groupChatModels } from "../src/renderer/src/modules/chat/components/composer/ModelPicker";
import { isImeComposing } from "../src/renderer/src/modules/chat/components/composer/keyboard";
import { buildPromptNavigationItems } from "../src/renderer/src/modules/chat/components/navigator/promptNavigatorUtils";

describe("v8.0.2 tool activity grouping", () => {
  it("pairs tool_call and tool_result by callId", () => {
    const items: Extract<
      ChatViewItem,
      { kind: "tool_call" | "tool_result" }
    >[] = [
      {
        id: "1",
        kind: "tool_call",
        callId: "c1",
        name: "read_file",
        args: "{}",
        status: "running",
      },
      {
        id: "2",
        kind: "tool_call",
        callId: "c2",
        name: "web_search",
        args: "{}",
        status: "running",
      },
      {
        id: "3",
        kind: "tool_result",
        callId: "c1",
        name: "read_file",
        content: "ok",
      },
    ];
    const ordered = orderToolActivityItems(items);
    expect(ordered.map((i) => i.id)).toEqual(["1", "3", "2"]);
    expect(toolActivityGroupTitle(items)).toBe("2 tools called");
  });
});

describe("v8.0.2 runtime tool events", () => {
  it("maps tool.event to canonical tool_call/tool_result view items", () => {
    let state = createInitialChatState("run-1");
    for (const action of chatRuntimeEventToActions(
      {
        type: "tool.event",
        runId: "run-1",
        event: {
          callId: "x",
          name: "shell",
          status: "running",
          preview: '{"cmd":"ls"}',
        },
      },
      null,
    )) {
      state = chatReducer(state, action);
    }
    expect(state.messages.some((m) => m.kind === "tool_call")).toBe(true);
    for (const action of chatRuntimeEventToActions(
      {
        type: "tool.event",
        runId: "run-1",
        event: {
          callId: "x",
          name: "shell",
          status: "completed",
          result: "done",
        },
      },
      null,
    )) {
      state = chatReducer(state, action);
    }
    expect(state.messages.some((m) => m.kind === "tool_result")).toBe(true);
  });
});

describe("v8.0.2 model groups + IME + navigator", () => {
  it("groups models by provider", () => {
    const groups = groupChatModels([
      { id: "a", label: "A", provider: "openai", model: "gpt" },
      { id: "b", label: "B", provider: "openai", model: "o1" },
      { id: "c", label: "C", provider: "anthropic", model: "claude" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.provider === "openai")?.models).toHaveLength(2);
  });

  it("detects IME composition", () => {
    expect(
      isImeComposing({
        keyCode: 229,
        nativeEvent: { isComposing: false },
      }),
    ).toBe(true);
    expect(
      isImeComposing({
        nativeEvent: { isComposing: true },
      }),
    ).toBe(true);
    expect(
      isImeComposing({
        nativeEvent: { isComposing: false },
      }),
    ).toBe(false);
  });

  it("builds prompt nav items from user messages", () => {
    const items = buildPromptNavigationItems([
      { id: "1", kind: "user", content: "hello\nworld" },
      { id: "2", kind: "assistant", content: "hi" },
      { id: "3", kind: "user", content: "next" },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].summary).toBe("hello");
  });
});
