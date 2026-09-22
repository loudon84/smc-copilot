import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error - the build helper is an ESM script without declarations.
import {
  prepareKnowledgeBuildConfig,
  KNOWLEDGE_BUILD_CONFIG_ERROR,
} from "../scripts/lib/work-knowledge-build-config.mjs";

let testDir = "";

function setup() {
  testDir = mkdtempSync(join(tmpdir(), "work-knowledge-config-"));
  return {
    outputPath: join(testDir, "resources", "work-knowledge-config.json"),
  };
}

afterEach(() => {
  if (testDir) rmSync(testDir, { recursive: true, force: true });
  testDir = "";
});

describe("work Knowledge build config preparation", () => {
  it("writes an enterprise origin from SMC_KNOWLEDGE_SERVICE_URL", () => {
    const { outputPath } = setup();

    const result = prepareKnowledgeBuildConfig({
      serviceUrl: "http://agent.superic.com:4530/v1",
      outputFile: outputPath,
    });

    expect(result).toEqual({
      mode: "enterprise",
      config: {
        schemaVersion: 1,
        serviceUrl: "http://agent.superic.com:4530",
      },
    });
    expect(JSON.parse(readFileSync(outputPath, "utf8"))).toEqual(result.config);
  });

  it("removes an old enterprise file when the env URL is unset", () => {
    const { outputPath } = setup();
    mkdirSync(join(testDir, "resources"), { recursive: true });
    writeFileSync(
      outputPath,
      JSON.stringify({ schemaVersion: 1, serviceUrl: "http://old.example:4530" }),
    );

    const result = prepareKnowledgeBuildConfig({
      serviceUrl: undefined,
      outputFile: outputPath,
    });

    expect(result).toEqual({ mode: "community" });
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects an invalid URL", () => {
    const { outputPath } = setup();
    expect(() =>
      prepareKnowledgeBuildConfig({
        serviceUrl: "not-a-url",
        outputFile: outputPath,
      }),
    ).toThrow(KNOWLEDGE_BUILD_CONFIG_ERROR);
    expect(existsSync(outputPath)).toBe(false);
  });
});
