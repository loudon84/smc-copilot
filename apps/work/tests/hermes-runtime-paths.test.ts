import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdirSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";

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

describe("hermes-runtime-paths", () => {
  const base = join(tmpdir(), `hermes-paths-${Date.now()}`);
  let savedHome: string | undefined;
  let savedLocal: string | undefined;
  let savedUserData: string | undefined;

  beforeEach(() => {
    savedHome = process.env.HERMES_HOME;
    savedLocal = process.env.LOCALAPPDATA;
    savedUserData = process.env.HERMES_DESKTOP_USER_DATA_DIR;
    mkdirSync(base, { recursive: true });
    delete process.env.HERMES_HOME;
  });

  afterEach(() => {
    if (savedHome === undefined) delete process.env.HERMES_HOME;
    else process.env.HERMES_HOME = savedHome;
    if (savedLocal === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = savedLocal;
    if (savedUserData === undefined) delete process.env.HERMES_DESKTOP_USER_DATA_DIR;
    else process.env.HERMES_DESKTOP_USER_DATA_DIR = savedUserData;
    rmSync(base, { recursive: true, force: true });
    vi.resetModules();
  });

  it("does not export Self-Install path symbols", async () => {
    const paths = await import("../src/main/runtime/hermes-runtime-paths");
    expect("HERMES_PYTHON" in paths).toBe(false);
    expect("HERMES_REPO" in paths).toBe(false);
    expect("HERMES_VENV" in paths).toBe(false);
    expect("HERMES_SCRIPT" in paths).toBe(false);
    expect("HERMES_ENV_FILE" in paths).toBe(false);
    expect("HERMES_CONFIG_FILE" in paths).toBe(false);
    expect("HERMES_AUTH_FILE" in paths).toBe(false);
    expect("hermesCliArgs" in paths).toBe(false);
    expect("installBinariesFor" in paths).toBe(false);
    expect("looksLikeHermesHome" in paths).toBe(false);
    expect("defaultHermesHome" in paths).toBe(false);
  });

  it("keeps HERMES_HOME live after override", async () => {
    const userData = join(base, "userdata");
    mkdirSync(userData, { recursive: true });
    process.env.HERMES_DESKTOP_USER_DATA_DIR = userData;
    vi.resetModules();

    const paths = await import("../src/main/runtime/hermes-runtime-paths");
    const home = join(base, "custom-home");
    mkdirSync(home, { recursive: true });

    expect(typeof paths.HERMES_HOME).toBe("string");
    paths.setHermesHomeOverride(home);
    expect(paths.readHermesHomeOverride()).toBe(home);
    expect(paths.HERMES_HOME).toBe(paths.getHermesHome());
    expect(existsSync(join(userData, "hermes-home.json"))).toBe(true);

    const other = join(base, "other-home");
    mkdirSync(other, { recursive: true });
    paths.setHermesHomeOverride(other);
    expect(paths.readHermesHomeOverride()).toBe(other);
    expect(paths.HERMES_HOME).toBe(paths.getHermesHome());

    paths.setHermesHomeOverride("");
    expect(paths.readHermesHomeOverride()).toBe("");
    expect(paths.HERMES_HOME).toBe(paths.getHermesHome());
  });

  it("canInvokeHermesCli is a boolean for the managed CLI path", async () => {
    const { canInvokeHermesCli } = await import(
      "../src/main/runtime/hermes-runtime-paths"
    );
    expect(typeof canInvokeHermesCli()).toBe("boolean");
  });

  it("getEnhancedPath includes process PATH", async () => {
    const { getEnhancedPath } = await import(
      "../src/main/runtime/hermes-runtime-paths"
    );
    const path = getEnhancedPath();
    expect(path.length).toBeGreaterThan(0);
    if (process.env.PATH) {
      expect(path).toContain(
        process.env.PATH.split(path.includes(";") ? ";" : ":")[0] ||
          process.env.PATH,
      );
    }
  });
});
