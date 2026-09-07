import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { SkillCatalogResponse, SkillCatalogToolItem } from "../../shared/skill-run";

const USER_DATA = join(tmpdir(), "work-skill-run-catalog-pref-test");

vi.mock("electron", () => ({
  app: {
    getPath: () => USER_DATA,
  },
}));

import {
  FAVORITE_LIMIT_REACHED,
  FAVORITE_UNKNOWN_TOOL,
  FAVORITES_MAX,
  RECENT_MAX,
  SkillRunCatalogPreferenceError,
  createSkillRunCatalogPreferenceStore,
} from "./skill-run-catalog-preference-store";

const STORE_FILE = join(USER_DATA, "skill-run-catalog-preferences.json");

const alpha: SkillCatalogToolItem = {
  toolName: "alpha",
  title: "Alpha",
  interactionMode: "chat",
  supportsAttachments: false,
  callability: "callable",
  invocationMode: "prompt-first",
  promptField: "prompt",
};

const beta: SkillCatalogToolItem = {
  ...alpha,
  toolName: "beta",
  title: "Beta",
};

function readyCatalog(tools: SkillCatalogToolItem[]): SkillCatalogResponse {
  return { status: "ready", tools };
}

describe("skill-run-catalog-preference-store", () => {
  beforeEach(() => {
    mkdirSync(USER_DATA, { recursive: true });
    if (existsSync(STORE_FILE)) {
      rmSync(STORE_FILE);
    }
  });

  afterEach(() => {
    if (existsSync(STORE_FILE)) {
      rmSync(STORE_FILE);
    }
  });

  it("rejects a favorite name that is not in the current catalog set", () => {
    const store = createSkillRunCatalogPreferenceStore({ getPath: () => STORE_FILE });
    expect(() =>
      store.setFavorite("scope-a", "ghost", true, new Set(["alpha"])),
    ).toThrow(SkillRunCatalogPreferenceError);
    try {
      store.setFavorite("scope-a", "ghost", true, new Set(["alpha"]));
    } catch (err) {
      expect(err).toBeInstanceOf(SkillRunCatalogPreferenceError);
      expect((err as SkillRunCatalogPreferenceError).errorCode).toBe(FAVORITE_UNKNOWN_TOOL);
    }
    const overlay = store.overlayCatalog("scope-a", readyCatalog([alpha]));
    expect(overlay.tools[0]?.favorited).toBe(false);
  });

  it("treats duplicate favorites as idempotent and refuses a 51st name", () => {
    const store = createSkillRunCatalogPreferenceStore({ getPath: () => STORE_FILE });
    const names = Array.from({ length: FAVORITES_MAX }, (_, i) => `tool.${i}`);
    const catalogNames = new Set(names);
    for (const name of names) {
      store.setFavorite("scope-a", name, true, catalogNames);
    }
    store.setFavorite("scope-a", "tool.0", true, catalogNames);
    expect(() =>
      store.setFavorite("scope-a", "tool.overflow", true, new Set([...names, "tool.overflow"])),
    ).toThrow(SkillRunCatalogPreferenceError);
    try {
      store.setFavorite("scope-a", "tool.overflow", true, new Set([...names, "tool.overflow"]));
    } catch (err) {
      expect((err as SkillRunCatalogPreferenceError).errorCode).toBe(FAVORITE_LIMIT_REACHED);
    }
  });

  it("caps recent at 20, moves a reused name to the head, and isolates auth scopes", () => {
    const store = createSkillRunCatalogPreferenceStore({ getPath: () => STORE_FILE });
    for (let i = 0; i < RECENT_MAX + 1; i += 1) {
      store.recordRecent("scope-a", `recent.${i}`);
    }
    store.recordRecent("scope-b", "other.scope");
    const toolsA = Array.from({ length: RECENT_MAX + 1 }, (_, i) => ({
      ...alpha,
      toolName: `recent.${i}`,
      title: `Recent ${i}`,
    }));
    const overlayA = store.overlayCatalog("scope-a", readyCatalog(toolsA));
    expect(overlayA.tools.find((tool) => tool.toolName === "recent.20")?.recentRank).toBe(1);
    expect(overlayA.tools.find((tool) => tool.toolName === "recent.1")?.recentRank).toBe(20);
    expect(overlayA.tools.find((tool) => tool.toolName === "recent.0")?.recentRank).toBeUndefined();

    store.recordRecent("scope-a", "recent.1");
    const moved = store.overlayCatalog("scope-a", readyCatalog(toolsA));
    expect(moved.tools.find((tool) => tool.toolName === "recent.1")?.recentRank).toBe(1);

    const overlayB = store.overlayCatalog("scope-b", readyCatalog([alpha, { ...alpha, toolName: "other.scope" }]));
    expect(overlayB.tools.find((tool) => tool.toolName === "other.scope")?.recentRank).toBe(1);
    expect(overlayB.tools.find((tool) => tool.toolName === "alpha")?.recentRank).toBeUndefined();
    expect(overlayB.tools.find((tool) => tool.toolName === "other.scope")?.favorited).toBe(false);
  });

  it("overlays intersection only and emits no tools for unauthorized catalogs", () => {
    const store = createSkillRunCatalogPreferenceStore({ getPath: () => STORE_FILE });
    store.setFavorite("scope-a", "alpha", true, new Set(["alpha", "beta"]));
    store.recordRecent("scope-a", "ghost");
    store.recordRecent("scope-a", "beta");
    const overlay = store.overlayCatalog("scope-a", readyCatalog([alpha, beta]));
    expect(overlay.tools.find((tool) => tool.toolName === "alpha")?.favorited).toBe(true);
    expect(overlay.tools.find((tool) => tool.toolName === "beta")?.recentRank).toBe(1);
    expect(overlay.tools.some((tool) => tool.toolName === "ghost")).toBe(false);

    const unauthorized = store.overlayCatalog("scope-a", {
      status: "unauthorized",
      tools: [],
    });
    expect(unauthorized.tools).toEqual([]);
    expect(unauthorized.status).toBe("unauthorized");
  });
});
