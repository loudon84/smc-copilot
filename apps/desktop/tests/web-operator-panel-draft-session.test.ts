import { describe, expect, it } from "vitest";
import {
  buildWebOperatorPanelDraftSessionId,
  isWebOperatorPanelDraftSession,
  WEB_OPERATOR_PANEL_DRAFT_SESSION_ID,
} from "../src/shared/web-operator/web-operator-panel-draft-session";

describe("web-operator-panel-draft-session", () => {
  it("buildWebOperatorPanelDraftSessionId is filesystem-safe on Windows", () => {
    const id = buildWebOperatorPanelDraftSessionId("wot_8a2ff30f4b5701f9ab4c6e20864c3bf6");
    expect(id).not.toContain(":");
    expect(id).toBe(`${WEB_OPERATOR_PANEL_DRAFT_SESSION_ID}_wot_8a2ff30f4b5701f9ab4c6e20864c3bf6`);
  });

  it("isWebOperatorPanelDraftSession matches base and task-scoped drafts", () => {
    expect(isWebOperatorPanelDraftSession(WEB_OPERATOR_PANEL_DRAFT_SESSION_ID)).toBe(true);
    expect(
      isWebOperatorPanelDraftSession(
        buildWebOperatorPanelDraftSessionId("wot_abc"),
      ),
    ).toBe(true);
    expect(isWebOperatorPanelDraftSession("real-session-id")).toBe(false);
  });
});
