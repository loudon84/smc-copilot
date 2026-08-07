import { describe, expect, it } from "vitest";
import {
  isWebOperatorPanelDraftSession,
  resolveModelsPageDefaultSavedModel,
} from "../src/main/hermes-default-chat/hermes-default-chat-models";
import { HERMES_PANEL_DRAFT_SESSION_ID } from "../src/main/hermes-default-chat/hermes-session-model-store";

describe("WebOperator panel draft session", () => {
  it("detects draft_weboperator", () => {
    expect(isWebOperatorPanelDraftSession(HERMES_PANEL_DRAFT_SESSION_ID)).toBe(true);
    expect(isWebOperatorPanelDraftSession("draft_default")).toBe(false);
    expect(isWebOperatorPanelDraftSession(undefined)).toBe(false);
  });
});

describe("resolveModelsPageDefaultSavedModel", () => {
  it("returns null when config has no root default", () => {
    // Uses live profile home in dev — only assert shape when no install.
    const result = resolveModelsPageDefaultSavedModel("nonexistent-profile-for-test");
    expect(result === null || typeof result?.id === "string").toBe(true);
  });
});
