import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync } from "fs";
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

describe("hermes-runtime-config", () => {
  const userData = join(tmpdir(), `runtime-config-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(userData, { recursive: true });
    process.env.HERMES_DESKTOP_USER_DATA_DIR = userData;
    delete process.env.HERMES_HOME;
    delete process.env.ProgramData;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.HERMES_DESKTOP_USER_DATA_DIR;
    delete process.env.HERMES_HOME;
    delete process.env.ProgramData;
    rmSync(userData, { recursive: true, force: true });
    vi.resetModules();
  });

  it("uses Windows enterprise defaults when no config files exist", async () => {
    const {
      getHermesRuntimeConfig,
      getGatewayBaseUrl,
      getHermesCliPath,
    } = await import("../src/main/runtime/hermes-runtime-config");
    const config = getHermesRuntimeConfig();
    if (process.platform === "win32") {
      expect(config.hermes.home).toBe("C:\\ProgramData\\SMC\\Hermes");
      expect(getHermesCliPath()).toBe(
        "D:\\Programs\\SMC\\Hermes\\bin\\hermes.exe",
      );
      expect(getGatewayBaseUrl()).toBe("http://127.0.0.1:8642");
    } else {
      expect(config.gateway.baseUrl).toBe("http://127.0.0.1:8642");
    }
  });

  it("prefers Work runtime.json over defaults", async () => {
    const customHome = join(userData, "custom-home");
    mkdirSync(customHome, { recursive: true });
    writeFileSync(
      join(userData, "runtime.json"),
      JSON.stringify({
        schemaVersion: 1,
        hermes: {
          home: customHome,
          programRoot: join(userData, "program"),
          cliPath: join(userData, "program", "bin", "hermes.exe"),
        },
        gateway: {
          baseUrl: "http://127.0.0.1:9000",
          healthPath: "/health",
        },
      }),
      "utf-8",
    );
    const { getHermesHome, getGatewayBaseUrl } = await import(
      "../src/main/runtime/hermes-runtime-config"
    );
    expect(getHermesHome()).toBe(customHome);
    expect(getGatewayBaseUrl()).toBe("http://127.0.0.1:9000");
  });

  it("rejects invalid gateway URL in runtime.json", async () => {
    writeFileSync(
      join(userData, "runtime.json"),
      JSON.stringify({
        gateway: { baseUrl: "not-a-url" },
      }),
      "utf-8",
    );
    const { getHermesRuntimeConfig } = await import(
      "../src/main/runtime/hermes-runtime-config"
    );
    expect(() => getHermesRuntimeConfig()).toThrow(/gateway.baseUrl/i);
  });

  it("honors machine HERMES_HOME when no runtime.json", async () => {
    const envHome = join(userData, "machine-home");
    mkdirSync(envHome, { recursive: true });
    process.env.HERMES_HOME = envHome;
    const { getHermesHome } = await import(
      "../src/main/runtime/hermes-runtime-config"
    );
    expect(getHermesHome()).toBe(envHome);
  });
});
