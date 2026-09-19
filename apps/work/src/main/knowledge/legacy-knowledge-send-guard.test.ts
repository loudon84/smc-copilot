import { describe, expect, it } from "vitest";
import {
  guardLegacyKnowledgeSend,
  isLegacyKnowledgeFirstCreate,
} from "./legacy-knowledge-send-guard";

describe("guardLegacyKnowledgeSend (G4 Plan B)", () => {
  it("allows Legacy first-create without resumeSessionId (no KNOWLEDGE_DASHBOARD_REQUIRED)", () => {
    const result = guardLegacyKnowledgeSend({
      knowledgeSetId: "KS-A",
      resumeSessionId: null,
      binding: null,
    });
    expect(result).toEqual({
      ok: true,
      mode: "first-create",
      bindingWritten: false,
    });
    if (result.ok === false) {
      expect(result.error).not.toContain("KNOWLEDGE_DASHBOARD_REQUIRED");
    }
  });

  it("requires kb-set row on subsequent Legacy send", () => {
    expect(
      guardLegacyKnowledgeSend({
        knowledgeSetId: "KS-A",
        resumeSessionId: "sess-1",
        binding: null,
      }).ok,
    ).toBe(false);

    expect(
      guardLegacyKnowledgeSend({
        knowledgeSetId: "KS-A",
        resumeSessionId: "sess-1",
        binding: {
          sessionId: "sess-1",
          profileId: "default",
          knowledgeSetId: "KS-A",
          sessionKind: "kb-set",
          executionProvider: "hermes-chat",
        },
      }),
    ).toEqual({
      ok: true,
      mode: "subsequent",
      bindingWritten: true,
    });
  });

  it("rejects scope conflict on subsequent send", () => {
    const result = guardLegacyKnowledgeSend({
      knowledgeSetId: "KS-A",
      resumeSessionId: "sess-1",
      binding: {
        sessionId: "sess-1",
        profileId: "default",
        knowledgeSetId: "KS-B",
        sessionKind: "kb-set",
        executionProvider: "hermes-chat",
      },
    });
    expect(result).toEqual({
      ok: false,
      error: "KNOWLEDGE_SESSION_SCOPE_CONFLICT",
    });
  });

  it("isLegacyKnowledgeFirstCreate only when set present and no resume", () => {
    expect(isLegacyKnowledgeFirstCreate("KS-A", null)).toBe(true);
    expect(isLegacyKnowledgeFirstCreate("KS-A", "sess-1")).toBe(false);
    expect(isLegacyKnowledgeFirstCreate("", null)).toBe(false);
  });
});
