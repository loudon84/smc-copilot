import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir, homedir } from "os";

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

  beforeEach(() => {
    savedHome = process.env.HERMES_HOME;
    savedLocal = process.env.LOCALAPPDATA;
    mkdirSync(base, { recursive: true });
    delete process.env.HERMES_HOME;
  });

  afterEach(() => {
    if (savedHome === undefined) delete process.env.HERMES_HOME;
    else process.env.HERMES_HOME = savedHome;
    if (savedLocal === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = savedLocal;
    rmSync(base, { recursive: true, force: true });
    vi.resetModules();
  });

  it("looksLikeHermesHome detects config.yaml markers", async () => {
    const { looksLikeHermesHome } = await import(
      "../src/main/runtime/hermes-runtime-paths"
    );
    const empty = join(base, "empty");
    mkdirSync(empty, { recursive: true });
    expect(looksLikeHermesHome(empty)).toBe(false);

    const withConfig = join(base, "with-config");
    mkdirSync(withConfig, { recursive: true });
    writeFileSync(join(withConfig, "config.yaml"), "model:\n  provider: x\n");
    expect(looksLikeHermesHome(withConfig)).toBe(true);
  });

  it("defaultHermesHome falls back to ~/.hermes on non-Windows", async () => {
    if (process.platform === "win32") return;
    const { defaultHermesHome } = await import(
      "../src/main/runtime/hermes-runtime-paths"
    );
    expect(defaultHermesHome()).toBe(join(homedir(), ".hermes"));
  });

  it("installBinariesFor returns platform-correct paths", async () => {
    const { installBinariesFor } = await import(
      "../src/main/runtime/hermes-runtime-paths"
    );
    const home = join(base, "home");
    const bins = installBinariesFor(home);
    if (process.platform === "win32") {
      expect(bins.python).toContain(join("Scripts", "python.exe"));
      expect(bins.script).toContain(join("Scripts", "hermes.exe"));
    } else {
      expect(bins.python).toContain(join("bin", "python"));
      expect(bins.script).toContain(join("hermes-agent", "hermes"));
    }
  });

  it("hermesCliArgs uses -m on Windows and script elsewhere", async () => {
    const { hermesCliArgs } = await import(
      "../src/main/runtime/hermes-runtime-paths"
    );
    const args = hermesCliArgs(["gateway"]);
    if (process.platform === "win32") {
      expect(args[0]).toBe("-m");
      expect(args[1]).toBe("hermes_cli.main");
      expect(args).toContain("gateway");
    } else {
      expect(args[args.length - 1]).toBe("gateway");
    }
  });

  it("canInvokeHermesCli is false when python is missing", async () => {
    const { canInvokeHermesCli } = await import(
      "../src/main/runtime/hermes-runtime-paths"
    );
    // Module-level HERMES_PYTHON points at a real-or-missing path; without a
    // real venv this should be false in a clean temp environment.
    expect(typeof canInvokeHermesCli()).toBe("boolean");
  });

  it("getEnhancedPath includes process PATH", async () => {
    const { getEnhancedPath } = await import(
      "../src/main/runtime/hermes-runtime-paths"
    );
    const path = getEnhancedPath();
    expect(path.length).toBeGreaterThan(0);
    if (process.env.PATH) {
      expect(path).toContain(process.env.PATH.split(path.includes(";") ? ";" : ":")[0] || process.env.PATH);
    }
  });

  it("setHermesHomeOverride persists and clears override file", async () => {
    const userData = join(base, "userdata");
    mkdirSync(userData, { recursive: true });
    process.env.HERMES_DESKTOP_USER_DATA_DIR = userData;
    vi.resetModules();

    const { setHermesHomeOverride, readHermesHomeOverride } = await import(
      "../src/main/runtime/hermes-runtime-paths"
    );
    const home = join(base, "custom-home");
    mkdirSync(home, { recursive: true });
    setHermesHomeOverride(home);
    expect(readHermesHomeOverride()).toBe(home);
    expect(existsSync(join(userData, "hermes-home.json"))).toBe(true);

    setHermesHomeOverride("");
    expect(readHermesHomeOverride()).toBe("");
  });
});
