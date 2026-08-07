import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeneHubError } from "../src/shared/genehub/genehub-errors";

vi.mock("../src/main/genehub/genehub-backend-descriptor", () => ({
  fetchGeneHubDescriptor: vi.fn(async () => ({
    ok: true,
    descriptor: {
      enabled: true,
      name: "GeneHub",
      apiPrefix: "/api/v1/desktop",
      healthEndpoint: "/api/v1/desktop/genehub/health",
      requiresAuth: true,
      apiBaseUrl: "http://127.0.0.1:4510/api/v1/desktop",
      backendBaseUrl: "http://127.0.0.1:4510",
    },
  })),
}));

vi.mock("../src/main/genehub/genehub-auth", () => ({
  getGeneHubAccessToken: () => "token",
}));

import {
  listAuthorizedSkills,
  mapGeneHubSkill,
  mapGeneHubJob,
  normalizeGeneHubBundleFiles,
  registerHermesProfile,
  heartbeat,
  createInstallJob,
} from "../src/main/genehub/genehub-client";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("genehub-client", () => {
  it("maps 401 to GENEHUB_NOT_AUTHENTICATED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ code: 401, message: "unauthorized", data: null }),
      })) as typeof fetch,
    );

    await expect(listAuthorizedSkills("default")).rejects.toMatchObject({
      code: "GENEHUB_NOT_AUTHENTICATED",
    } satisfies Partial<GeneHubError>);
  });

  it("mapGeneHubSkill supports slug/version/name/permissions list/installed_status", () => {
    const skill = mapGeneHubSkill({
      slug: "contact-to-order",
      name: "Contact To Order",
      version: "1.0.0",
      permissions: ["view", "install", "update"],
      installed_status: "not_installed",
      update_available: false,
    });

    expect(skill.geneSlug).toBe("contact-to-order");
    expect(skill.displayName).toBe("Contact To Order");
    expect(skill.geneVersion).toBe("1.0.0");
    expect(skill.permissions.canInstall).toBe(true);
    expect(skill.permissions.canUpdate).toBe(true);
    expect(skill.installed).toBe(false);
  });

  it("mapGeneHubJob reads job_type", () => {
    const job = mapGeneHubJob({
      job_id: "job_1",
      profile_id: "p1",
      gene_slug: "demo",
      job_type: "update",
      status: "pending",
    });
    expect(job.action).toBe("update");
  });

  it("normalizeGeneHubBundleFiles supports array and dict formats", () => {
    const fromArray = normalizeGeneHubBundleFiles([
      { relative_path: "SKILL.md", content: "# demo" },
    ]);
    expect(fromArray).toEqual([
      { relativePath: "SKILL.md", content: "# demo", encoding: "utf-8" },
    ]);

    const fromDict = normalizeGeneHubBundleFiles({
      "skills/contact-to-order/SKILL.md": "# demo",
    });
    expect(fromDict).toEqual([
      {
        relativePath: "skills/contact-to-order/SKILL.md",
        content: "# demo",
        encoding: "utf-8",
      },
    ]);
  });

  it("registerHermesProfile sends desktop_device_id", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ code: 0, message: "ok", data: { profile_id: "srv_profile_1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    const result = await registerHermesProfile({
      profileName: "default",
      profileId: "default",
      hermesHome: "C:\\\\hermes",
      gatewayUrl: "http://127.0.0.1:8642",
      gatewayPort: 8642,
      capabilities: { skills: true, scripts: true, reload: false },
      desktopDeviceId: "device_123",
    });

    expect(result.profileId).toBe("srv_profile_1");
    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? "{}"),
    );
    expect(body.desktop_device_id).toBe("device_123");
    expect(body.profile_name).toBe("default");
    expect(body.profile_id).toBeUndefined();
  });

  it("heartbeat sends desktop_device_id and profile_name", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ code: 0, message: "ok", data: { config: {} } }),
    }));
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    await heartbeat({
      deviceId: "device_123",
      profiles: [{ profileId: "srv_p1", profileName: "default", status: "active" }],
    });

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? "{}"),
    );
    expect(body.desktop_device_id).toBe("device_123");
    expect(body.profiles[0]).toEqual({
      profile_id: "srv_p1",
      profile_name: "default",
      status: "active",
    });
  });

  it("createInstallJob uses job_type", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            job_id: "job_1",
            profile_id: "p1",
            gene_slug: "demo",
            job_type: "install",
            status: "pending",
          },
        }),
    }));
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    const job = await createInstallJob({
      profileId: "p1",
      geneSlug: "demo",
      action: "install",
    });

    expect(job.jobId).toBe("job_1");
    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? "{}"),
    );
    expect(body.job_type).toBe("install");
    expect(body.version).toBe("latest");
    expect(body.action).toBeUndefined();
  });
});
