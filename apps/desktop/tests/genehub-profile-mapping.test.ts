import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let testHermesHome = "";

vi.mock("../src/main/utils", () => ({
  profileHome: () => testHermesHome,
  safeWriteFile: (path: string, content: string) => {
    const { writeFileSync, mkdirSync: mk } = require("fs") as typeof import("fs");
    const { dirname } = require("path") as typeof import("path");
    mk(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf-8");
  },
}));

import {
  readProfileMapping,
  resolveLocalProfileByServerId,
  resolveServerProfileId,
  saveProfileMappingEntry,
} from "../src/main/genehub/genehub-profile-mapping";

beforeEach(() => {
  testHermesHome = join(tmpdir(), `genehub-mapping-${Date.now()}`);
  mkdirSync(join(testHermesHome, "desktop", "genehub"), { recursive: true });
});

afterEach(() => {
  if (testHermesHome && existsSync(testHermesHome)) {
    rmSync(testHermesHome, { recursive: true, force: true });
  }
});

describe("genehub-profile-mapping", () => {
  it("persists and resolves server ↔ local profile ids", () => {
    saveProfileMappingEntry({
      localProfileId: "default",
      localProfileName: "default",
      serverProfileId: "srv_123",
      deviceId: "dev_1",
    });

    const mapping = readProfileMapping();
    expect(mapping.profiles).toHaveLength(1);
    expect(resolveServerProfileId("default")).toBe("srv_123");
    expect(resolveLocalProfileByServerId("srv_123")?.localProfileName).toBe("default");
  });

  it("updates existing entry by local profile id", () => {
    saveProfileMappingEntry({
      localProfileId: "default",
      localProfileName: "default",
      serverProfileId: "srv_old",
      deviceId: "dev_1",
    });
    saveProfileMappingEntry({
      localProfileId: "default",
      localProfileName: "default",
      serverProfileId: "srv_new",
      deviceId: "dev_1",
    });
    expect(resolveServerProfileId("default")).toBe("srv_new");
    expect(readProfileMapping().profiles).toHaveLength(1);
  });
});
