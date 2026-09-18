/**
 * A-PROFILE-001 / A-PROFILE-002 / A-STATE-002 — Hermes Root vs Active Profile Home.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

vi.mock("electron", () => ({
  app: {
    getPath: (name: string): string => {
      if (name === "userData") {
        return process.env.HERMES_DESKTOP_USER_DATA_DIR || tmpdir();
      }
      return tmpdir();
    },
    setPath: (): void => {},
  },
}));

describe("Hermes Root vs Active Profile Home", () => {
  let hermesHome: string;
  let userData: string;
  let savedHome: string | undefined;
  let savedUserData: string | undefined;

  beforeEach(() => {
    savedHome = process.env.HERMES_HOME;
    savedUserData = process.env.HERMES_DESKTOP_USER_DATA_DIR;
    const base = mkdtempSync(join(tmpdir(), "hermes-root-"));
    hermesHome = join(base, "hermes");
    userData = join(base, "userdata");
    process.env.HERMES_HOME = hermesHome;
    process.env.HERMES_DESKTOP_USER_DATA_DIR = userData;
    vi.resetModules();
  });

  afterEach(() => {
    if (savedHome === undefined) delete process.env.HERMES_HOME;
    else process.env.HERMES_HOME = savedHome;
    if (savedUserData === undefined) {
      delete process.env.HERMES_DESKTOP_USER_DATA_DIR;
    } else {
      process.env.HERMES_DESKTOP_USER_DATA_DIR = savedUserData;
    }
    rmSync(join(hermesHome, ".."), { recursive: true, force: true });
    vi.resetModules();
  });

  it("keeps Hermes Root constant when resolving a named Active Profile Home (A-PROFILE-001)", async () => {
    const { invalidateHermesRuntimeConfigCache } = await import(
      "../src/main/runtime/hermes-runtime-config"
    );
    invalidateHermesRuntimeConfigCache();
    const {
      getHermesRoot,
      getActiveProfileHome,
      getHermesPluginRoot,
    } = await import("../src/main/runtime/hermes-root");
    const { getHermesHome } = await import(
      "../src/main/runtime/hermes-runtime-paths"
    );

    const rootBefore = getHermesRoot();
    expect(rootBefore).toBe(hermesHome);
    expect(getHermesHome()).toBe(rootBefore);

    const namedHome = getActiveProfileHome("coder");
    expect(namedHome).toBe(join(hermesHome, "profiles", "coder"));
    expect(namedHome).not.toBe(rootBefore);

    // Switching profile must not rewrite Root / getHermesHome().
    expect(getHermesRoot()).toBe(rootBefore);
    expect(getHermesHome()).toBe(rootBefore);
    expect(getActiveProfileHome()).toBe(rootBefore);
    expect(getActiveProfileHome("default")).toBe(rootBefore);
  });

  it("sets CLI env HERMES_HOME to Active Profile Home for -p without moving Root (A-PROFILE-002)", async () => {
    const { invalidateHermesRuntimeConfigCache } = await import(
      "../src/main/runtime/hermes-runtime-config"
    );
    invalidateHermesRuntimeConfigCache();
    const { getHermesRoot } = await import("../src/main/runtime/hermes-root");
    const {
      buildHermesCliEnv,
      profileFromHermesCliArgs,
    } = await import("../src/main/runtime/hermes-cli-runner");

    const root = getHermesRoot();
    const args = ["-p", "coder", "skills", "list"];
    expect(profileFromHermesCliArgs(args)).toBe("coder");

    const env = buildHermesCliEnv({}, "coder");
    expect(env.HERMES_HOME).toBe(join(root, "profiles", "coder"));
    expect(getHermesRoot()).toBe(root);

    const defaultEnv = buildHermesCliEnv();
    expect(defaultEnv.HERMES_HOME).toBe(root);
  });

  it("resolves plugin root under Active Profile Home beneath Hermes Root (A-STATE-002)", async () => {
    const { invalidateHermesRuntimeConfigCache } = await import(
      "../src/main/runtime/hermes-runtime-config"
    );
    invalidateHermesRuntimeConfigCache();
    const { getHermesRoot, getHermesPluginRoot } = await import(
      "../src/main/runtime/hermes-root"
    );

    const root = getHermesRoot();
    expect(getHermesPluginRoot()).toBe(join(root, "plugins"));
    expect(getHermesPluginRoot("coder")).toBe(
      join(root, "profiles", "coder", "plugins"),
    );
    expect(getHermesPluginRoot("coder").startsWith(root)).toBe(true);
  });
});
