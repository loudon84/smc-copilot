import { describe, it, expect } from "vitest";
import {
  buildMainWorkspaceTabs,
  isWorkspaceTabView,
} from "../src/renderer/src/screens/MainPage/main-page-tabs";

describe("buildMainWorkspaceTabs", () => {
  it("includes static system and operator tabs plus office", () => {
    const tabs = buildMainWorkspaceTabs();
    expect(tabs.map((t) => t.id)).toEqual([
      "portal",
      "workspaces",
      "task-workbench",
      "web-operator",
      "office",
    ]);
    expect(tabs.every((t) => t.source === "system" || t.source === "operator")).toBe(
      true,
    );
  });
});

describe("isWorkspaceTabView", () => {
  it("recognizes V3.2 workspace tab views", () => {
    expect(isWorkspaceTabView("portal")).toBe(true);
    expect(isWorkspaceTabView("workspaces")).toBe(true);
    expect(isWorkspaceTabView("task-workbench")).toBe(true);
    expect(isWorkspaceTabView("web-operator")).toBe(true);
    expect(isWorkspaceTabView("office")).toBe(true);
    expect(isWorkspaceTabView("external-browser:abc")).toBe(true);
    expect(isWorkspaceTabView("chat" as never)).toBe(false);
  });
});
