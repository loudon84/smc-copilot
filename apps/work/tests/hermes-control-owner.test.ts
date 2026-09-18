import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("hermes control owner", () => {
  const dir = join(tmpdir(), `smc-owner-${Date.now()}`);
  const path = join(dir, "control-owner.json");

  afterEach(() => {
    delete process.env.SMC_HERMES_CONTROL_OWNER;
    delete process.env.SMC_CONTROL_OWNER_PATH;
    rmSync(dir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("defaults to direct (no Runtime :8765)", async () => {
    process.env.SMC_CONTROL_OWNER_PATH = join(dir, "missing-control-owner.json");
    delete process.env.SMC_HERMES_CONTROL_OWNER;
    const { getHermesControlOwner, isDirectControlOwner, isRuntimeControlOwner } =
      await import("../src/main/hermes/control-owner");
    expect(getHermesControlOwner()).toBe("direct");
    expect(isDirectControlOwner()).toBe(true);
    expect(isRuntimeControlOwner()).toBe(false);
  });

  it("prefers env over file", async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify({ hermes: "runtime" }), "utf-8");
    process.env.SMC_CONTROL_OWNER_PATH = path;
    process.env.SMC_HERMES_CONTROL_OWNER = "salt";
    const { getHermesControlOwner, isSaltControlOwner } = await import(
      "../src/main/hermes/control-owner"
    );
    expect(getHermesControlOwner()).toBe("salt");
    expect(isSaltControlOwner()).toBe(true);
  });

  it("reads salt from file when env unset", async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify({ hermes: "salt" }), "utf-8");
    process.env.SMC_CONTROL_OWNER_PATH = path;
    delete process.env.SMC_HERMES_CONTROL_OWNER;
    const { getHermesControlOwner } = await import(
      "../src/main/hermes/control-owner"
    );
    expect(getHermesControlOwner()).toBe("salt");
  });

  it("reads opsi from file with effective direct (A-OWNER-001)", async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify({ hermes: "opsi" }), "utf-8");
    process.env.SMC_CONTROL_OWNER_PATH = path;
    delete process.env.SMC_HERMES_CONTROL_OWNER;
    const {
      getHermesControlOwner,
      getEffectiveControlOwner,
      isOpsiControlOwner,
      isExternallyManagedControlOwner,
      isDirectControlOwner,
      readControlOwnerSnapshot,
    } = await import("../src/main/hermes/control-owner");
    expect(getHermesControlOwner()).toBe("opsi");
    expect(getEffectiveControlOwner()).toBe("direct");
    expect(isOpsiControlOwner()).toBe(true);
    expect(isExternallyManagedControlOwner()).toBe(false);
    expect(isDirectControlOwner()).toBe(true);
    const snapshot = readControlOwnerSnapshot();
    expect(snapshot.observed).toBe("opsi");
    expect(snapshot.effective).toBe("direct");
    expect(snapshot.owner).toBe("opsi");
  });

  it("maps observed salt to effective direct", async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify({ hermes: "salt" }), "utf-8");
    process.env.SMC_CONTROL_OWNER_PATH = path;
    delete process.env.SMC_HERMES_CONTROL_OWNER;
    const { readControlOwnerSnapshot, isExternallyManagedControlOwner } =
      await import("../src/main/hermes/control-owner");
    const snapshot = readControlOwnerSnapshot();
    expect(snapshot.observed).toBe("salt");
    expect(snapshot.effective).toBe("direct");
    expect(isExternallyManagedControlOwner()).toBe(false);
  });

  it("keeps runtime effective as runtime", async () => {
    process.env.SMC_CONTROL_OWNER_PATH = join(dir, "missing.json");
    process.env.SMC_HERMES_CONTROL_OWNER = "runtime";
    const { getHermesControlOwner, getEffectiveControlOwner, isRuntimeControlOwner } =
      await import("../src/main/hermes/control-owner");
    expect(getHermesControlOwner()).toBe("runtime");
    expect(getEffectiveControlOwner()).toBe("runtime");
    expect(isRuntimeControlOwner()).toBe(true);
  });

  it("rejects illegal owner values by falling back to default", async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify({ hermes: "narnia" }), "utf-8");
    process.env.SMC_CONTROL_OWNER_PATH = path;
    delete process.env.SMC_HERMES_CONTROL_OWNER;
    const { getHermesControlOwner, isDirectControlOwner } = await import(
      "../src/main/hermes/control-owner"
    );
    expect(getHermesControlOwner()).toBe("direct");
    expect(isDirectControlOwner()).toBe(true);
  });
});
