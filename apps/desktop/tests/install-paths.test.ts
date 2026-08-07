import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("install-marker and install-log paths", () => {
  let tempRoot: string;
  const prevEnv = process.env.SMC_COPILOT_INSTALL_DIR;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "smc-paths-"));
    process.env.SMC_COPILOT_INSTALL_DIR = tempRoot;
    mkdirSync(join(tempRoot, "runtime"), { recursive: true });
  });

  afterEach(() => {
    if (prevEnv === undefined) {
      delete process.env.SMC_COPILOT_INSTALL_DIR;
    } else {
      process.env.SMC_COPILOT_INSTALL_DIR = prevEnv;
    }
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("writes install-marker under runtimeRoot", async () => {
    const { writeInstallMarker, readInstallMarker } = await import(
      "../src/main/enterprise/install-marker"
    );
    const result = writeInstallMarker({
      schemaVersion: "1.2.1",
      installedAt: new Date().toISOString(),
      desktopVersion: "1.0.0",
      agentVersion: "test",
      bundleSha256: "",
      installPath: join(tempRoot, "runtime"),
      hermesHomePath: "",
      profiles: [],
      deploymentConfigHash: "",
      doctorResult: null,
      rollbackSnapshots: [],
    });
    expect(result.ok).toBe(true);
    expect(existsSync(join(tempRoot, "runtime", "install-marker.json"))).toBe(
      true,
    );
    const marker = readInstallMarker();
    expect(marker?.desktopVersion).toBe("1.0.0");
  });

  it("writes install logs under runtimeRoot/logs", async () => {
    const { createInstallLogger, readLatestInstallLog } = await import(
      "../src/main/enterprise/install-log"
    );
    const logger = createInstallLogger();
    logger.info("check-enterprise-install", "test log line");
    logger.close();

    const logDir = join(tempRoot, "runtime", "logs");
    expect(existsSync(logDir)).toBe(true);
    const content = readLatestInstallLog();
    expect(content).toContain("test log line");
    expect(content).toContain("check-enterprise-install");
  });
});
