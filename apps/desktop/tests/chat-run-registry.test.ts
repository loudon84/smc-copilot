import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetChatRunRegistryForTests,
  listChatRuns,
  upsertChatRun,
  patchChatRun,
  getChatRun,
} from "../src/renderer/src/modules/chat/workspace/chatRunRegistry";

/**
 * Legacy registry — retained for compatibility until callers migrate fully.
 * New isolation tests live in chat-workspace-reducer.test.ts.
 */
describe("chatRunRegistry (legacy compat)", () => {
  beforeEach(() => {
    __resetChatRunRegistryForTests();
  });

  it("tracks concurrent runs independently", () => {
    upsertChatRun({
      runId: "r1",
      sessionId: "s1",
      profileId: "default",
      title: "A",
      loading: true,
      unread: false,
      completed: false,
    });
    upsertChatRun({
      runId: "r2",
      sessionId: "s2",
      profileId: "default",
      title: "B",
      loading: true,
      unread: false,
      completed: false,
    });
    patchChatRun("r2", { loading: false, completed: true, unread: true });
    expect(getChatRun("r1")?.loading).toBe(true);
    expect(getChatRun("r2")?.completed).toBe(true);
    expect(listChatRuns()).toHaveLength(2);
  });
});
