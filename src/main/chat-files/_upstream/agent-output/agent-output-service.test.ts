// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileAssociation, ManagedFile } from "../../../shared/files";

const mockState = vi.hoisted(() => ({
  hermesHome: "",
  files: new Map<string, ManagedFile>(),
  associations: [] as FileAssociation[],
  domainEvents: [] as Array<{ type: string; fileId: string; sessionId?: string }>,
}));

vi.mock("../../utils", () => ({
  profileHome: (profile?: unknown) => {
    if (
      typeof profile === "string" &&
      profile.trim() &&
      profile.trim() !== "default"
    ) {
      return join(mockState.hermesHome, "profiles", profile.trim());
    }
    return mockState.hermesHome;
  },
}));

vi.mock("../file-domain-events", () => ({
  emitFileDomainEvent: (event: {
    type: string;
    fileId: string;
    sessionId?: string;
  }) => {
    mockState.domainEvents.push(event);
  },
}));

vi.mock("../file-association-store", () => ({
  normalizeProfileId: (id?: string | null) =>
    id == null || String(id).trim() === "" ? "default" : String(id).trim(),
  listByMessage: (profileId: string, messageId: string) => {
    const pid =
      profileId == null || String(profileId).trim() === ""
        ? "default"
        : String(profileId).trim();
    return mockState.associations
      .filter((a) => a.profileId === pid && a.messageId === messageId)
      .map((a) => {
        const file = mockState.files.get(`${pid}:${a.fileId}`);
        if (!file) return null;
        return { ...file, association: a };
      })
      .filter(Boolean);
  },
  findByHash: (profileId: string, hash: string) => {
    const pid =
      profileId == null || String(profileId).trim() === ""
        ? "default"
        : String(profileId).trim();
    for (const [key, file] of mockState.files) {
      if (key.startsWith(`${pid}:`) && file.contentHash === hash) return file;
    }
    return null;
  },
  upsertManagedFile: (file: ManagedFile) => {
    mockState.files.set(`${file.profileId}:${file.id}`, { ...file });
  },
  getManagedFile: (profileId: string, fileId: string) => {
    const pid =
      profileId == null || String(profileId).trim() === ""
        ? "default"
        : String(profileId).trim();
    return mockState.files.get(`${pid}:${fileId}`) ?? null;
  },
  insertAssociation: (assoc: FileAssociation) => {
    mockState.associations.push({ ...assoc });
  },
}));

describe("agent-output-service createFromMessage", () => {
  beforeEach(() => {
    mockState.hermesHome = mkdtempSync(join(tmpdir(), "hermes-agent-out-"));
    mockState.files.clear();
    mockState.associations = [];
    mockState.domainEvents = [];
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(mockState.hermesHome, { recursive: true, force: true });
  });

  async function load() {
    return import("./agent-output-service");
  }

  const longReport = [
    "# 客户画像报告",
    "",
    "段落一 ".repeat(30),
    "",
    "段落二 ".repeat(30),
    "",
    "段落三 ".repeat(30),
    "",
    "## 总结",
    "",
    "结论 ".repeat(20),
  ].join("\n");

  it("writes UTF-8 markdown under generated/<sessionId>/", async () => {
    const { createFromMessage } = await load();
    const result = await createFromMessage({
      sessionId: "sess-1",
      messageId: "msg-1",
      title: "客户画像报告",
      content: longReport,
      extension: "md",
    });

    expect(result.alreadyExisted).toBe(false);
    expect(result.file.source).toBe("agent-output");
    expect(result.file.status).toBe("ready");
    expect(result.association.role).toBe("agent-output");
    expect(result.association.messageId).toBe("msg-1");

    const expected = join(
      mockState.hermesHome,
      "desktop",
      "files",
      "generated",
      "sess-1",
      "客户画像报告.md",
    );
    expect(existsSync(expected)).toBe(true);
    expect(readFileSync(expected, "utf8")).toBe(longReport);
    expect(mockState.domainEvents.some((e) => e.type === "file:created")).toBe(
      true,
    );
    expect(
      mockState.domainEvents.some((e) => e.type === "file:association-created"),
    ).toBe(true);
  });

  it("is idempotent for the same message", async () => {
    const { createFromMessage } = await load();
    const first = await createFromMessage({
      sessionId: "sess-1",
      messageId: "msg-dup",
      title: "Report",
      content: longReport,
      extension: "md",
    });
    const second = await createFromMessage({
      sessionId: "sess-1",
      messageId: "msg-dup",
      title: "Report",
      content: longReport,
      extension: "md",
    });
    expect(second.alreadyExisted).toBe(true);
    expect(second.file.id).toBe(first.file.id);
  });

  it("does not overwrite on title collision across messages", async () => {
    const { createFromMessage } = await load();
    await createFromMessage({
      sessionId: "sess-1",
      messageId: "msg-a",
      title: "Same Title",
      content: longReport,
      extension: "md",
    });
    const second = await createFromMessage({
      sessionId: "sess-1",
      messageId: "msg-b",
      title: "Same Title",
      content: `${longReport}\n\nextra`,
      extension: "md",
    });
    expect(second.file.name).toBe("Same Title (1).md");
  });

  it("rejects empty content", async () => {
    const { createFromMessage } = await load();
    await expect(
      createFromMessage({
        sessionId: "sess-1",
        messageId: "msg-empty",
        title: "x",
        content: "   ",
        extension: "md",
      }),
    ).rejects.toMatchObject({
      fileError: { code: "INVALID_MESSAGE_CONTENT" },
    });
  });

  it("isolates profiles", async () => {
    const { createFromMessage } = await load();
    const a = await createFromMessage({
      profile: "alice",
      sessionId: "sess-1",
      messageId: "msg-1",
      title: "Report",
      content: longReport,
      extension: "md",
    });
    const b = await createFromMessage({
      profile: "bob",
      sessionId: "sess-1",
      messageId: "msg-1",
      title: "Report",
      content: longReport,
      extension: "md",
    });
    expect(a.file.id).not.toBe(b.file.id);
    expect(
      existsSync(
        join(
          mockState.hermesHome,
          "profiles",
          "alice",
          "desktop",
          "files",
          "generated",
          "sess-1",
          "Report.md",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(
          mockState.hermesHome,
          "profiles",
          "bob",
          "desktop",
          "files",
          "generated",
          "sess-1",
          "Report.md",
        ),
      ),
    ).toBe(true);
  });
});
