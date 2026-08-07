import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";

const repoRoot = join(__dirname, "..");

vi.mock("electron", () => ({
  app: {
    getAppPath: () => repoRoot,
    isPackaged: false,
  },
}));

vi.mock("../src/main/profile-runtime-db", () => ({
  initProfileRuntimeDb: vi.fn(),
  getProfileByName: vi.fn(() => null),
  getProfile: vi.fn((id: string) => ({ id, name: "existing-writer" })),
  checkPortConflict: vi.fn(() => ({
    profile_id: "existing-profile-id",
    host: "127.0.0.1",
    port: 9601,
    base_url: "http://127.0.0.1:9601",
    status: "stopped",
    runtime_type: "hermes-local",
  })),
}));

import {
  previewExpertPresetInstall,
  resolveExpertPresetPath,
} from "../src/main/profile-roles/role-preset-installer";

describe("hermes-expert-profiles.team_v1.4 preset", () => {
  const v14Path = join(
    repoRoot,
    "resources/profile-presets/hermes-expert-profiles.team_v1.4.yaml",
  );
  const v1Path = join(repoRoot, "resources/profile-presets/hermes-expert-profiles.v1.yaml");

  it("team_v1.4 yaml exists with six expert profiles", () => {
    expect(existsSync(v14Path)).toBe(true);
    const content = readFileSync(v14Path, "utf-8");
    expect(content).toContain("version: team_v1.4");
    expect(content).toContain("writer-9601");
    expect(content).toContain("engineer-9612");
    expect(content).toContain("research-9602");
    expect(content).toContain("hurman-9621");
    expect(content).toContain("finance-9631");
    expect(content).toContain("sales-9641");
    expect(content).toMatch(/port:\s*9601/);
    expect(content).toMatch(/port:\s*9641/);
  });

  it("v1 yaml remains for backward compatibility", () => {
    expect(existsSync(v1Path)).toBe(true);
    const content = readFileSync(v1Path, "utf-8");
    expect(content).toContain("profiles:");
    expect(content).toContain("writer-9601");
  });
});

describe("previewExpertPresetInstall port conflict", () => {
  it("detects port 9601 conflict for team_v1.4 preset", () => {
    const presetPath = resolveExpertPresetPath("team_v1.4");
    expect(existsSync(presetPath)).toBe(true);

    const result = previewExpertPresetInstall({ presetVersion: "team_v1.4" });
    expect(result.totalProfiles).toBeGreaterThan(0);
    expect(result.canInstall).toBe(false);
    expect(result.portConflicts.length).toBeGreaterThan(0);
    expect(result.portConflicts[0]?.port).toBe(9601);
    expect(result.portConflicts[0]?.usedByProfileName).toBe("existing-writer");
  });
});
