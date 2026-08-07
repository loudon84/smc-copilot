import { describe, expect, it } from "vitest";
import {
  appendPersistedSessionFiles,
  listPersistedSessionFiles,
  migratePersistedDraftAttachments,
  removePersistedSessionFile,
  sessionKey,
} from "../src/main/chat-files/chat-files-session-store";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * These tests exercise migrate/list/remove semantics with unique session ids
 * to avoid colliding with a developer's live index.
 */
describe("chat-files-session-store", () => {
  const profile = `test-profile-${Date.now()}`;
  const draftId = `draft-${Date.now()}`;
  const realId = `sess-${Date.now()}`;

  it("uses profile::session key", () => {
    expect(sessionKey(profile, draftId)).toBe(`${profile}::${draftId}`);
  });

  it("appends, migrates draft, and removes files", () => {
    appendPersistedSessionFiles(profile, draftId, [
      {
        id: "f1",
        name: "a.txt",
        mimeType: "text/plain",
        sizeBytes: 1,
        path: join(tmpdir(), "a.txt"),
        category: "attachment",
      },
    ]);
    expect(listPersistedSessionFiles(profile, draftId)).toHaveLength(1);

    const migrated = migratePersistedDraftAttachments(profile, draftId, realId);
    expect(migrated.some((f) => f.id === "f1")).toBe(true);
    expect(listPersistedSessionFiles(profile, draftId)).toHaveLength(0);
    expect(
      listPersistedSessionFiles(profile, realId).some((f) => f.id === "f1"),
    ).toBe(true);

    removePersistedSessionFile(profile, "f1", realId);
    expect(
      listPersistedSessionFiles(profile, realId).some((f) => f.id === "f1"),
    ).toBe(false);
  });
});
