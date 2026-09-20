import { afterEach, describe, expect, it, vi } from "vitest";

const readEnv = vi.hoisted(() => vi.fn(() => ({} as Record<string, string>)));

vi.mock("./config", async () => {
  const actual = await vi.importActual<typeof import("./config")>("./config");
  return {
    ...actual,
    readEnv,
    getConnectionConfig: () => ({ mode: "local" }),
  };
});

vi.mock("./utils", async () => {
  const actual = await vi.importActual<typeof import("./utils")>("./utils");
  return {
    ...actual,
    getActiveProfileNameSync: () => undefined,
    normalizeProfileName: (name?: string) => {
      const t = name?.trim();
      return t && t !== "default" ? t : undefined;
    },
  };
});

import {
  LOCAL_DASHBOARD_DEFAULT_PORT,
  resolveLocalDashboardAttachCandidates,
  startDashboard,
} from "./dashboard";

describe("resolveLocalDashboardAttachCandidates", () => {
  afterEach(() => {
    readEnv.mockReset();
    readEnv.mockReturnValue({});
    delete process.env.HERMES_DASHBOARD_SESSION_TOKEN;
    delete process.env.HERMES_DESKTOP_DASHBOARD_PORT;
  });

  it("fails closed without a session token", () => {
    const result = resolveLocalDashboardAttachCandidates("default");
    expect(result).toEqual({
      error:
        "KNOWLEDGE_DASHBOARD_REQUIRED: Local Hermes Dashboard session token not found (HERMES_DASHBOARD_SESSION_TOKEN).",
    });
  });

  it("reads token and default port 9119 from profile env", () => {
    readEnv.mockImplementation(((_profile?: string): Record<string, string> => {
      if (!_profile) return {};
      return { HERMES_DASHBOARD_SESSION_TOKEN: "tok-profile" };
    }) as () => Record<string, string>);
    const result = resolveLocalDashboardAttachCandidates("alfie");
    expect(result).toEqual({
      port: LOCAL_DASHBOARD_DEFAULT_PORT,
      token: "tok-profile",
      baseUrl: `http://127.0.0.1:${LOCAL_DASHBOARD_DEFAULT_PORT}`,
    });
  });

  it("prefers process.env over profile env", () => {
    process.env.HERMES_DASHBOARD_SESSION_TOKEN = "tok-env";
    process.env.HERMES_DESKTOP_DASHBOARD_PORT = "9220";
    readEnv.mockReturnValue({
      HERMES_DASHBOARD_SESSION_TOKEN: "tok-profile",
      HERMES_DESKTOP_DASHBOARD_PORT: "9119",
    });
    const result = resolveLocalDashboardAttachCandidates();
    expect(result).toEqual({
      port: 9220,
      token: "tok-env",
      baseUrl: "http://127.0.0.1:9220",
    });
  });
});

describe("startDashboard local isolation", () => {
  afterEach(() => {
    delete process.env.HERMES_DASHBOARD_SESSION_TOKEN;
  });

  it("ordinary startDashboard stays stubbed even when token exists", async () => {
    process.env.HERMES_DASHBOARD_SESSION_TOKEN = "tok-env";
    const status = await startDashboard();
    expect(status.running).toBe(false);
    expect(status.error).toBe("Local dashboard process is not owned by Work.");
  });
});
