/**
 * v8.2 Chat Workspace store unit tests.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";

const { TEST_HOME } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os");
  return {
    TEST_HOME: path.join(
      os.tmpdir(),
      `hermes-chat-workspace-test-${Date.now()}`,
    ),
  };
});

vi.mock("../src/main/installer", () => ({
  HERMES_HOME: TEST_HOME,
  HERMES_PYTHON: "/usr/bin/python3",
  HERMES_SCRIPT: "/dev/null",
  getEnhancedPath: () => process.env.PATH || "",
}));

vi.mock("../src/main/utils", async () => {
  const actual = await vi.importActual<typeof import("../src/main/utils")>(
    "../src/main/utils",
  );
  return {
    ...actual,
    stateDbPathForProfile: (profileId?: string) => {
      if (!profileId || profileId === "default") {
        return join(TEST_HOME, "state.db");
      }
      return join(TEST_HOME, "profiles", profileId, "state.db");
    },
  };
});

vi.mock("../src/main/chat-runtime/chat-runtime-store", () => ({
  getRun: () => null,
}));

import { __resetChatWorkspaceDbForTests } from "../src/main/chat-workspace/chat-workspace-db";
import * as service from "../src/main/chat-workspace/chat-workspace-service";
import * as catalog from "../src/main/session-catalog/session-catalog-service";

describe("chat-workspace service v8.2", () => {
  beforeEach(() => {
    mkdirSync(join(TEST_HOME, "desktop"), { recursive: true });
    __resetChatWorkspaceDbForTests();
  });

  afterEach(() => {
    __resetChatWorkspaceDbForTests();
    try {
      rmSync(TEST_HOME, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  // @lat: [[persistent-chat-workspace-tests#Persistent Chat Workspace tests#Opens runs and restores snapshot order]]
  it("opens runs and restores snapshot order", () => {
    service.openRun({
      runId: "run-a",
      profileId: "default",
      title: "A",
      activate: true,
    });
    service.openRun({
      runId: "run-b",
      profileId: "default",
      title: "B",
      activate: true,
    });
    const snap = service.getSnapshot();
    expect(snap.runs.map((r) => r.runId)).toEqual(["run-a", "run-b"]);
    expect(snap.activeRunId).toBe("run-b");
  });

  // @lat: [[persistent-chat-workspace-tests#Persistent Chat Workspace tests#Binds session turning draft into session]]
  it("binds sessionId turning draft into session", () => {
    service.openRun({ runId: "run-d", title: "New Chat", titleSource: "placeholder" });
    const before = service.getSnapshot().runs[0];
    expect(before.sessionId).toBeNull();
    service.bindSessionToRun("run-d", "sess-1", "Hello world");
    const after = service.getSnapshot().runs[0];
    expect(after.sessionId).toBe("sess-1");
    expect(after.title).toBe("Hello world");
  });

  // @lat: [[persistent-chat-workspace-tests#Persistent Chat Workspace tests#Open session deduplicates by session id]]
  it("openSession deduplicates by sessionId", () => {
    service.openRun({
      runId: "run-1",
      sessionId: "sess-x",
      profileId: "default",
      title: "X",
    });
    const { result } = service.openSession({
      profileId: "default",
      sessionId: "sess-x",
      title: "X",
    });
    expect(result.created).toBe(false);
    expect(result.runId).toBe("run-1");
  });

  // @lat: [[persistent-chat-workspace-tests#Persistent Chat Workspace tests#Migrates v1 localStorage shape once]]
  it("migrates v1 localStorage shape once", () => {
    service.migrateFromV1({
      activeRunId: "legacy-1",
      runs: [
        {
          runId: "legacy-1",
          sessionId: null,
          profileId: "default",
          createdAt: 1,
          updatedAt: 2,
          createdOrder: 1,
          mode: "default",
          permissionMode: "default",
          workMode: "ask",
          runState: "idle",
          title: "Legacy",
          titleSource: "placeholder",
          sessionFilesVisible: false,
          previewMaximized: false,
          draft: "hello",
        },
      ],
    });
    const snap = service.getSnapshot();
    expect(snap.runs).toHaveLength(1);
    expect(snap.runs[0].draft).toBe("hello");
    expect(service.isMigrationDone()).toBe(true);
    service.migrateFromV1({
      activeRunId: "legacy-2",
      runs: [
        {
          runId: "legacy-2",
          sessionId: null,
          profileId: "default",
          createdAt: 1,
          updatedAt: 2,
          createdOrder: 1,
          mode: "default",
          permissionMode: "default",
          workMode: "ask",
          runState: "idle",
          title: "Other",
          titleSource: "placeholder",
          sessionFilesVisible: false,
          previewMaximized: false,
        },
      ],
    });
    expect(service.getSnapshot().runs).toHaveLength(1);
  });

  // @lat: [[persistent-chat-workspace-tests#Persistent Chat Workspace tests#Session catalog lists drafts from workspace]]
  it("session catalog lists drafts from workspace", () => {
    service.openRun({
      runId: "draft-1",
      profileId: "default",
      title: "Blank",
    });
    const listed = catalog.listSessions({ includeDrafts: true });
    expect(listed.drafts.some((d) => d.runId === "draft-1")).toBe(true);
  });
});
