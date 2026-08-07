import { describe, it, expect } from "vitest";
import {
  WORKSPACE_PAGE_KEYS,
  WORKSPACE_PAGE_REGISTRY,
} from "../src/renderer/src/screens/Workspaces/registry/workspace-pages";
import { SIDEBAR_NAV_ITEMS } from "../src/renderer/src/screens/Workspaces/constants";

describe("workspace-pages registry", () => {
  it("covers every sidebar nav key with a page component", () => {
    const navKeys = SIDEBAR_NAV_ITEMS.map((item) => item.key);
    expect(WORKSPACE_PAGE_KEYS.sort()).toEqual(navKeys.sort());
    for (const key of navKeys) {
      expect(WORKSPACE_PAGE_REGISTRY[key]).toBeDefined();
    }
  });
});
