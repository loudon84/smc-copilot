import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetChatRunRegistryForTests,
  listChatRuns,
  upsertChatRun,
  patchChatRun,
  getChatRun,
} from "../src/renderer/src/modules/chat/workspace/chatRunRegistry";

describe("chatRunRegistry multi-chat isolation", () => {
  beforeEach(() => {
    __resetChatRunRegistryForTests();
  });

  it("tracks three concurrent runs independently", () => {
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
    upsertChatRun({
      runId: "r3",
      sessionId: null,
      profileId: "writer",
      title: "C",
      loading: false,
      unread: false,
      completed: false,
    });
    patchChatRun("r2", { loading: false, completed: true, unread: true });
    expect(getChatRun("r1")?.loading).toBe(true);
    expect(getChatRun("r2")?.completed).toBe(true);
    expect(getChatRun("r3")?.profileId).toBe("writer");
    expect(listChatRuns()).toHaveLength(3);
  });
});
