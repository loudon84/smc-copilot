import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findActivePrompt,
  usePromptNavigator,
} from "./usePromptNavigator";
import { getPromptAnchorId } from "./promptNavigatorUtils";
import type { PromptNavigationItem } from "./promptNavigatorUtils";

const items: PromptNavigationItem[] = [
  {
    messageId: "u1",
    sequence: 1,
    label: "First",
    fullText: "First",
    attachmentCount: 0,
  },
  {
    messageId: "u2",
    sequence: 2,
    label: "Second",
    fullText: "Second",
    attachmentCount: 0,
  },
];

function mountAnchors(runId: string): {
  container: HTMLDivElement;
  cleanup: () => void;
} {
  const container = document.createElement("div");
  Object.defineProperty(container, "getBoundingClientRect", {
    value: () => ({
      top: 0,
      bottom: 500,
      left: 0,
      right: 400,
      width: 400,
      height: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  document.body.appendChild(container);

  for (const [index, item] of items.entries()) {
    const anchor = document.createElement("div");
    anchor.id = getPromptAnchorId(runId, item.messageId);
    Object.defineProperty(anchor, "getBoundingClientRect", {
      value: () => ({
        top: index === 0 ? 40 : 200,
        bottom: index === 0 ? 80 : 240,
        left: 0,
        right: 100,
        width: 100,
        height: 40,
        x: 0,
        y: index === 0 ? 40 : 200,
        toJSON: () => ({}),
      }),
    });
    document.body.appendChild(anchor);
  }

  return {
    container,
    cleanup: () => {
      for (const item of items) {
        document.getElementById(getPromptAnchorId(runId, item.messageId))
          ?.remove();
      }
      container.remove();
    },
  };
}

// @lat: [[prompt-navigator-tests#Prompt Navigator tests#Active turn and jump]]
describe("usePromptNavigator", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    class FakeResizeObserver {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("findActivePrompt picks the last user prompt above the active line", () => {
    const runId = "run-a";
    const { cleanup } = mountAnchors(runId);
    const container = document.createElement("div");
    Object.defineProperty(container, "getBoundingClientRect", {
      value: () => ({
        top: 0,
        bottom: 500,
        left: 0,
        right: 400,
        width: 400,
        height: 500,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    // Active line at top+96. First anchor at 40 (<=96), second at 200 (>96).
    expect(findActivePrompt(container, runId, items)).toBe("u1");
    cleanup();
  });

  it("jumpToPrompt scrolls, pauses via scrollToNode, and highlights", () => {
    const runId = "run-b";
    const { container, cleanup } = mountAnchors(runId);
    const scrollToNode = vi.fn();
    const containerRef = { current: container };

    const { result } = renderHook(() =>
      usePromptNavigator({
        runId,
        active: true,
        containerRef,
        items,
        scrollToNode,
      }),
    );

    act(() => {
      result.current.jumpToPrompt("u2");
    });

    expect(scrollToNode).toHaveBeenCalledTimes(1);
    const anchor = document.getElementById(getPromptAnchorId(runId, "u2"));
    expect(anchor?.classList.contains("chat-message-prompt-highlight")).toBe(
      true,
    );
    expect(result.current.activePromptId).toBe("u2");
    cleanup();
  });

  it("does not register scroll listeners when inactive", () => {
    const runId = "run-c";
    const { container, cleanup } = mountAnchors(runId);
    const addEventListener = vi.spyOn(container, "addEventListener");
    const containerRef = { current: container };

    renderHook(() =>
      usePromptNavigator({
        runId,
        active: false,
        containerRef,
        items,
        scrollToNode: vi.fn(),
      }),
    );

    expect(addEventListener).not.toHaveBeenCalled();
    cleanup();
  });
});
