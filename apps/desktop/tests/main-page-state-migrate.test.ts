import { describe, it, expect } from "vitest";
import { migrateMainPageState } from "../src/main/shell/main-page-state-migrate";

describe("migrateMainPageState", () => {
  it("maps v2 lastActiveWorkspace aios-home to portal", () => {
    const result = migrateMainPageState({
      version: 2,
      sidebarMode: "expanded",
      workspaceOrder: [],
      externalTabs: [],
      lastActiveWorkspace: "aios-home",
    });
    expect(result.lastActiveWorkspace).toBe("portal");
  });

  it("maps v2 workspaceOrder and workspaceSecondaryState keys", () => {
    const result = migrateMainPageState({
      version: 2,
      sidebarMode: "rail",
      workspaceOrder: ["aios-home", "external-browser:abc"],
      externalTabs: [],
      workspaceSecondaryState: {
        "aios-home": "chat",
        workspaces: "runtime",
      },
    });
    expect(result.workspaceOrder).toEqual(["portal", "external-browser:abc"]);
    expect(result.workspaceSecondaryState).toEqual({
      portal: "chat",
      workspaces: "runtime",
    });
  });

  it("maps v1 lastActiveView and tabOrder to portal", () => {
    const result = migrateMainPageState({
      version: 1,
      sidebarMode: "hidden",
      tabOrder: ["aios-home", "web-operator"],
      externalTabs: [],
      lastActiveView: "aios-home",
    });
    expect(result.version).toBe(2);
    expect(result.lastActiveWorkspace).toBe("portal");
    expect(result.workspaceOrder).toEqual(["portal", "web-operator"]);
  });

  it("leaves portal and other ids unchanged", () => {
    const result = migrateMainPageState({
      version: 2,
      sidebarMode: "expanded",
      workspaceOrder: ["portal", "office"],
      externalTabs: [],
      lastActiveWorkspace: "portal",
    });
    expect(result.lastActiveWorkspace).toBe("portal");
    expect(result.workspaceOrder).toEqual(["portal", "office"]);
  });
});
