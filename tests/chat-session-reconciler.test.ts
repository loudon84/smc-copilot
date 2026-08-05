import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildReconcileEvents,
  __resetSessionReconcilerForTests,
} from "../src/main/chat-runtime/chat-session-reconciler";

vi.mock("../src/main/sessions", () => ({
  getSessionMessages: vi.fn(() => [
    { id: 1, role: "user", content: "hi", timestamp: 1 },
    { id: 2, role: "assistant", content: "yo", timestamp: 2 },
    { id: 3, role: "tool", content: "search done", timestamp: 3 },
  ]),
}));

describe("chat-session-reconciler", () => {
  beforeEach(() => {
    __resetSessionReconcilerForTests();
  });

  it("does not replay assistant text as message.delta (avoids duplicates)", () => {
    const events = buildReconcileEvents([
      { id: 2, role: "assistant", content: "yo", timestamp: 2 },
      { id: 3, role: "tool", content: "search done", timestamp: 3 },
    ]);
    expect(events.every((e) => e.type !== "message.delta")).toBe(true);
    expect(events.some((e) => e.type === "tool.progress")).toBe(true);
  });
});
