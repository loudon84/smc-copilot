// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

vi.mock("./utils", () => ({
  profileHome: () => tmpdir(),
  safeWriteFile: vi.fn(),
}));
vi.mock("./skills", () => ({
  installSkill: vi.fn(),
  listInstalledSkills: () => [],
}));
const createProfileMock = vi.hoisted(() => vi.fn());
vi.mock("./profiles", () => ({ createProfile: createProfileMock }));
vi.mock("./soul", () => ({ writeSoul: vi.fn() }));
vi.mock("./installer", () => ({ listMcpServers: () => [] }));

const fetchMock = vi.fn();
const originalRuntimePath = process.env.HERMES_SKILL_REGISTRY_CONFIG_FILE;
const originalResourcesPath = Object.getOwnPropertyDescriptor(
  process,
  "resourcesPath",
);
let tempDir = "";

function descriptor(registryId = "runtime-test") {
  return {
    schemaVersion: 1,
    registryId,
    indexUrl: "https://registry.example/index.json",
    modelsUrl: "https://registry.example/models.json",
    contentBaseUrl: "https://registry.example/content",
    treeUrl: "https://registry.example/tree.json",
    webBaseUrl: "https://registry.example/web",
    iconBaseUrl: "https://icons.example/registry",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function setResourcesPath(path?: string): void {
  Object.defineProperty(process, "resourcesPath", {
    configurable: true,
    value: path,
  });
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "work-registry-test-"));
  delete process.env.HERMES_SKILL_REGISTRY_CONFIG_FILE;
  delete process.env.HERMES_SKILL_REGISTRY_URL;
  setResourcesPath(undefined);
  fetchMock.mockReset();
  createProfileMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.resetModules();
});

afterEach(() => {
  if (originalRuntimePath === undefined) {
    delete process.env.HERMES_SKILL_REGISTRY_CONFIG_FILE;
  } else {
    process.env.HERMES_SKILL_REGISTRY_CONFIG_FILE = originalRuntimePath;
  }
  if (originalResourcesPath) {
    Object.defineProperty(process, "resourcesPath", originalResourcesPath);
  } else {
    setResourcesPath(undefined);
  }
  vi.unstubAllGlobals();
  rmSync(tempDir, { recursive: true, force: true });
});

async function registryModule(): Promise<typeof import("./registry")> {
  return import("./registry");
}

describe("Registry endpoint descriptor", () => {
  it("uses a valid Main-only runtime descriptor for catalog requests", async () => {
    const configPath = join(tempDir, "registry.json");
    writeFileSync(configPath, JSON.stringify(descriptor()), "utf8");
    process.env.HERMES_SKILL_REGISTRY_CONFIG_FILE = configPath;
    fetchMock.mockResolvedValue(
      jsonResponse({
        entries: [
          {
            id: "writer",
            type: "skill",
            name: "Writer",
            path: "skills/writer",
            icon: "skills/writer/icon.svg",
          },
        ],
      }),
    );

    const { fetchRegistry } = await registryModule();
    await expect(fetchRegistry(true)).resolves.toMatchObject({
      skills: [
        {
          id: "writer",
          homepage: "https://registry.example/web/skills/writer",
          icon: "https://icons.example/registry/skills/writer/icon.svg",
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://registry.example/index.json",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("uses the selected descriptor for models and skill detail content", async () => {
    const configPath = join(tempDir, "registry.json");
    writeFileSync(configPath, JSON.stringify(descriptor()), "utf8");
    process.env.HERMES_SKILL_REGISTRY_CONFIG_FILE = configPath;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "https://registry.example/models.json") {
        return jsonResponse({
          providers: [{ id: "local", name: "Local", models: [] }],
        });
      }
      if (url === "https://registry.example/content/skills/writer/SKILL.md") {
        return new Response("# Writer", { status: 200 });
      }
      throw new Error(`unexpected URL: ${url}`);
    });

    const { fetchModelRegistry, fetchRegistryDetail } = await registryModule();
    await expect(fetchModelRegistry()).resolves.toMatchObject({
      providers: [{ id: "local" }],
    });
    await expect(
      fetchRegistryDetail("skills", {
        id: "writer",
        name: "Writer",
        description: "",
        path: "skills/writer",
      }),
    ).resolves.toEqual({ markdown: "# Writer" });
  });

  it("fails a selected invalid runtime source before an install can make a network request", async () => {
    process.env.HERMES_SKILL_REGISTRY_CONFIG_FILE = "relative-registry.json";

    const { installRegistryItem } = await registryModule();
    await expect(
      installRegistryItem("skills", {
        id: "writer",
        name: "Writer",
        description: "",
        path: "skills/writer",
      }),
    ).resolves.toEqual({
      success: false,
      error: "Registry configuration is invalid",
      errorCode: "SKILL_REGISTRY_CONFIG_INVALID",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid selected source before agent installation creates a profile", async () => {
    process.env.HERMES_SKILL_REGISTRY_CONFIG_FILE = "relative-registry.json";
    createProfileMock.mockReturnValue({ success: true });

    const { installRegistryItem } = await registryModule();
    await expect(
      installRegistryItem("agents", {
        id: "writer",
        name: "Writer",
        description: "",
        path: "agents/writer",
      }),
    ).resolves.toMatchObject({
      success: false,
      errorCode: "SKILL_REGISTRY_CONFIG_INVALID",
    });
    expect(createProfileMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("selects a complete build descriptor before a valid runtime descriptor", async () => {
    const buildDescriptor = descriptor("build-test");
    buildDescriptor.indexUrl = "https://build.registry/index.json";
    const runtimeDescriptor = descriptor("runtime-test");
    runtimeDescriptor.indexUrl = "https://runtime.registry/index.json";
    writeFileSync(
      join(tempDir, "work-registry-config.json"),
      JSON.stringify(buildDescriptor),
      "utf8",
    );
    const runtimePath = join(tempDir, "runtime.json");
    writeFileSync(runtimePath, JSON.stringify(runtimeDescriptor), "utf8");
    setResourcesPath(tempDir);
    process.env.HERMES_SKILL_REGISTRY_CONFIG_FILE = runtimePath;
    fetchMock.mockResolvedValue(jsonResponse({ entries: [] }));

    const { fetchRegistry } = await registryModule();
    await fetchRegistry(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://build.registry/index.json",
      expect.any(Object),
    );
  });

  it("fails closed for a malformed selected runtime descriptor without falling back", async () => {
    const configPath = join(tempDir, "registry.json");
    writeFileSync(
      configPath,
      JSON.stringify({ schemaVersion: 1, registryId: "partial" }),
      "utf8",
    );
    process.env.HERMES_SKILL_REGISTRY_CONFIG_FILE = configPath;

    const { fetchRegistry } = await registryModule();
    await expect(fetchRegistry()).resolves.toEqual({
      skills: [],
      mcps: [],
      agents: [],
      workflows: [],
      error: "Registry configuration is invalid",
      errorCode: "SKILL_REGISTRY_CONFIG_INVALID",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a registry identity that cannot be safely included in Main telemetry", async () => {
    const configPath = join(tempDir, "registry.json");
    writeFileSync(
      configPath,
      JSON.stringify({ ...descriptor(), registryId: "token=should-not-log" }),
      "utf8",
    );
    process.env.HERMES_SKILL_REGISTRY_CONFIG_FILE = configPath;

    const { fetchRegistry } = await registryModule();
    await expect(fetchRegistry()).resolves.toMatchObject({
      errorCode: "SKILL_REGISTRY_CONFIG_INVALID",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores the legacy single-URL variable and preserves the public default descriptor", async () => {
    process.env.HERMES_SKILL_REGISTRY_URL =
      "https://override.example/not-allowed";
    fetchMock.mockResolvedValue(jsonResponse({ entries: [] }));

    const { fetchRegistry } = await registryModule();
    await fetchRegistry();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/fathah/hermes-registry/refs/heads/main/index.json",
      expect.any(Object),
    );
  });

  it("keeps TTL cache reuse inside one descriptor identity and clears it on explicit reset", async () => {
    const configPath = join(tempDir, "registry.json");
    const first = descriptor("first");
    first.indexUrl = "https://first.registry/index.json";
    writeFileSync(configPath, JSON.stringify(first), "utf8");
    process.env.HERMES_SKILL_REGISTRY_CONFIG_FILE = configPath;
    fetchMock.mockResolvedValue(jsonResponse({ entries: [] }));

    const { __resetRegistryForTests, fetchRegistry } = await registryModule();
    await fetchRegistry();
    await fetchRegistry();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = descriptor("second");
    second.indexUrl = "https://second.registry/index.json";
    writeFileSync(configPath, JSON.stringify(second), "utf8");
    __resetRegistryForTests();
    await fetchRegistry();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://first.registry/index.json",
      "https://second.registry/index.json",
    ]);
  });

  it("returns a stable unavailable error without leaking a failed endpoint", async () => {
    const configPath = join(tempDir, "registry.json");
    writeFileSync(configPath, JSON.stringify(descriptor()), "utf8");
    process.env.HERMES_SKILL_REGISTRY_CONFIG_FILE = configPath;
    fetchMock.mockRejectedValue(
      new Error("https://secret.example/?token=leak"),
    );

    const { fetchRegistry } = await registryModule();
    await expect(fetchRegistry()).resolves.toEqual({
      skills: [],
      mcps: [],
      agents: [],
      workflows: [],
      error: "Registry is unavailable",
      errorCode: "SKILL_REGISTRY_UNAVAILABLE",
    });
  });

  it("rejects unsafe entry paths before they can become descriptor content requests", async () => {
    const configPath = join(tempDir, "registry.json");
    writeFileSync(configPath, JSON.stringify(descriptor()), "utf8");
    process.env.HERMES_SKILL_REGISTRY_CONFIG_FILE = configPath;
    fetchMock.mockResolvedValue(jsonResponse({ entries: [] }));

    const { fetchRegistryDetail } = await registryModule();
    await expect(
      fetchRegistryDetail("skills", {
        id: "writer",
        name: "Writer",
        description: "fallback",
        path: "../secret",
      }),
    ).resolves.toEqual({ description: "fallback" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps descriptor paths provider-neutral and never forwards GitHub tokens", async () => {
    const configPath = join(tempDir, "registry.json");
    writeFileSync(configPath, JSON.stringify(descriptor()), "utf8");
    process.env.HERMES_SKILL_REGISTRY_CONFIG_FILE = configPath;
    process.env.GITHUB_TOKEN = "must-not-leave-process";
    process.env.GH_TOKEN = "must-not-leave-process";
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "https://registry.example/tree.json") {
        return jsonResponse({
          tree: [{ path: "skills/writer/readme.txt", type: "blob" }],
        });
      }
      if (url === "https://registry.example/content/skills/writer/readme.txt") {
        return new Response("hello", { status: 200 });
      }
      return jsonResponse({ entries: [] });
    });

    const { installRegistryItem } = await registryModule();
    await expect(
      installRegistryItem("skills", {
        id: "writer",
        name: "Writer",
        description: "",
        path: "skills/writer",
      }),
    ).resolves.toEqual({ success: true });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://registry.example/tree.json",
      "https://registry.example/content/skills/writer/readme.txt",
    ]);
    for (const [, init] of fetchMock.mock.calls as Array<
      [string, RequestInit]
    >) {
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
      expect(headers.Accept).not.toContain("vnd.github");
    }
  });
});
