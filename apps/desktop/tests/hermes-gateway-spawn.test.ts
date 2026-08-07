import { describe, expect, it } from "vitest";
import { buildHermesGatewaySpawnOptions } from "../src/main/hermes-local-adapter";

describe("buildHermesGatewaySpawnOptions", () => {
  it("uses pipe stdio, detached process, and no shell", () => {
    const options = buildHermesGatewaySpawnOptions(
      { HERMES_HOME: "C:\\hermes" },
      "C:\\agent",
    );

    expect(options.stdio).toEqual(["ignore", "pipe", "pipe"]);
    expect(options.detached).toBe(true);
    expect(options.shell).toBe(false);
  });

  it("sets Python stream env vars", () => {
    const options = buildHermesGatewaySpawnOptions({ FOO: "bar" }, "/repo");

    expect(options.env).toMatchObject({
      FOO: "bar",
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8",
    });
  });

  it("hides console window on Windows", () => {
    const options = buildHermesGatewaySpawnOptions({}, "/repo");

    if (process.platform === "win32") {
      expect(options.windowsHide).toBe(true);
    } else {
      expect(options.windowsHide).toBe(false);
    }
  });
});
