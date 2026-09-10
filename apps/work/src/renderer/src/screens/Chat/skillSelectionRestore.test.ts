import { describe, expect, it } from "vitest";
import type { SkillCatalogToolItem } from "../../../../shared/skill-run";
import { resolveRestoredSkillSelection, buildSkillRunQueueRequest, isSkillRunCallable, skillRunComposerAttachmentsDisabled } from "./Chat";

const catalogTool: SkillCatalogToolItem = {
  toolName: "calculator",
  title: "Calculator",
  interactionMode: "chat",
  promptField: "prompt",
  supportsAttachments: false,
  callability: "callable",
  invocationMode: "prompt-first",
  category: "math",
};

describe("resolveRestoredSkillSelection", () => {
  it("returns the catalog entry when the tool is present", () => {
    expect(
      resolveRestoredSkillSelection(
        { toolName: "calculator", toolTitle: "Calculator" },
        [catalogTool],
      ),
    ).toBe(catalogTool);
  });

  it("falls back to unsupported display metadata when the catalog entry is missing", () => {
    expect(
      resolveRestoredSkillSelection(
        { toolName: "legacy-skill", toolTitle: "Legacy Skill" },
        [catalogTool],
      ),
    ).toEqual({
      toolName: "legacy-skill",
      title: "Legacy Skill",
      interactionMode: "chat",
      supportsAttachments: false,
      callability: "unsupported",
      invocationMode: "unsupported-schema",
      reasonCode: "CONTRACT_MISMATCH",
    });
  });
});

describe("buildSkillRunQueueRequest", () => {
  it("copies extraParameters at enqueue and does not alias later edits", () => {
    const live = { region: "cn" };
    const snapshot = buildSkillRunQueueRequest({
      toolName: "writer.extra",
      prompt: "hello",
      clientRequestId: "req-1",
      extraParameters: live,
    });
    live.region = "edited";
    expect(snapshot.extraParameters).toEqual({ region: "cn" });
  });

  it("omits extraParameters for prompt-first snapshots", () => {
    const snapshot = buildSkillRunQueueRequest({
      toolName: "calculator",
      prompt: "2+2",
      clientRequestId: "req-2",
    });
    expect(snapshot.extraParameters).toBeUndefined();
  });

  it("copies fileIds at enqueue and does not alias later array edits", () => {
    const live = ["file-a", "file-b"];
    const snapshot = buildSkillRunQueueRequest({
      toolName: "writer.article",
      prompt: "hello",
      clientRequestId: "req-att-1",
      fileIds: live,
    });
    live.push("file-later");
    live[0] = "file-edited";
    expect(snapshot.fileIds).toEqual(["file-a", "file-b"]);
  });
});

describe("skillRunComposerAttachmentsDisabled", () => {
  it("enables attach only in Skill mode when Catalog supportsAttachments is true", () => {
    expect(skillRunComposerAttachmentsDisabled(true, true)).toBe(false);
    expect(skillRunComposerAttachmentsDisabled(true, false)).toBe(true);
    expect(skillRunComposerAttachmentsDisabled(true, undefined)).toBe(true);
    expect(skillRunComposerAttachmentsDisabled(false, true)).toBe(true);
  });
});

describe("isSkillRunCallable", () => {
  it("treats catalog callability as the start gate", () => {
    expect(isSkillRunCallable(catalogTool)).toBe(true);
    expect(
      isSkillRunCallable({
        ...catalogTool,
        callability: "unsupported",
      }),
    ).toBe(false);
  });
});

