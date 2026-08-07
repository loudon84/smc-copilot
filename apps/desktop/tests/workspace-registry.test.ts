import { describe, it, expect } from "vitest";
import { STATIC_WORKSPACE_MODULES, resolveWorkspaceModule } from "../src/renderer/src/workspace/workspace-registry";
import { buildWorkspaceTabs } from "../src/renderer/src/workspace/workspace-tabs";
import { resolveShellLayerId } from "../src/renderer/src/workspace/resolve-workspace";

describe("workspace registry", () => {
  it("registers static workspaces including office", () => {
    expect(STATIC_WORKSPACE_MODULES.map((m) => m.id)).toEqual([
      "portal",
      "workspaces",
      "task-workbench",
      "web-operator",
      "office",
    ]);
  });

  it("resolveWorkspaceModule returns module for static ids", () => {
    expect(resolveWorkspaceModule("office")?.kind).toBe("react");
    expect(resolveWorkspaceModule("external-browser:x")).toBeNull();
  });

  it("buildWorkspaceTabs includes office", () => {
    const tabs = buildWorkspaceTabs();
    expect(tabs.map((t) => t.id)).toContain("office");
  });

  it("resolveShellLayerId maps web layers", () => {
    expect(resolveShellLayerId("portal")).toBe("portal");
    expect(resolveShellLayerId("web-operator")).toBe("web-operator");
    expect(resolveShellLayerId("external-browser:abc" as never)).toBe(
      "external-browser:abc",
    );
    expect(resolveShellLayerId("office")).toBeNull();
  });
});
