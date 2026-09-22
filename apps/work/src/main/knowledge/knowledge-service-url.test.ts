import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_KNOWLEDGE_SERVICE_URL,
  resolveKnowledgeServiceUrl,
} from "./knowledge-service-url";

let testDir = "";

afterEach(() => {
  if (testDir) rmSync(testDir, { recursive: true, force: true });
  testDir = "";
});

describe("knowledge-service-url", () => {
  it("defaults to the loopback Knowledge service", () => {
    expect(resolveKnowledgeServiceUrl({})).toBe(DEFAULT_KNOWLEDGE_SERVICE_URL);
  });

  it("accepts an explicit origin override", () => {
    expect(
      resolveKnowledgeServiceUrl({
        SMC_KNOWLEDGE_SERVICE_URL: "https://knowledge.example:4530/extra",
      }),
    ).toBe("https://knowledge.example:4530");
  });

  it("rejects an invalid URL", () => {
    expect(() =>
      resolveKnowledgeServiceUrl({ SMC_KNOWLEDGE_SERVICE_URL: "not-a-url" }),
    ).toThrow("KNOWLEDGE_SERVICE_URL_INVALID");
  });

  it("prefers env over packaged build config", () => {
    expect(
      resolveKnowledgeServiceUrl({
        env: { SMC_KNOWLEDGE_SERVICE_URL: "http://env.example:4530" },
        buildConfig: { serviceUrl: "http://build.example:4530" },
      }),
    ).toBe("http://env.example:4530");
  });

  it("uses packaged build config when env is unset", () => {
    expect(
      resolveKnowledgeServiceUrl({
        env: {},
        buildConfig: {
          serviceUrl: "http://agent.superic.com:4530/path",
        },
      }),
    ).toBe("http://agent.superic.com:4530");
  });

  it("reads work-knowledge-config.json from candidate paths", () => {
    testDir = mkdtempSync(join(tmpdir(), "knowledge-url-"));
    const configPath = join(testDir, "work-knowledge-config.json");
    mkdirSync(testDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        schemaVersion: 1,
        serviceUrl: "http://agent.superic.com:4530",
      }),
    );

    expect(
      resolveKnowledgeServiceUrl({
        env: {},
        configPaths: [configPath],
      }),
    ).toBe("http://agent.superic.com:4530");
  });
});
