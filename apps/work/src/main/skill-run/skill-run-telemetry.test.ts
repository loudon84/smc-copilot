import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { join } from "path";

const USER_DATA = "E:/tmp/work-skill-run-telemetry-test";

vi.mock("electron", () => ({
  app: {
    getPath: () => USER_DATA,
  },
}));

import {
  fingerprintRequestId,
  recordSkillRunTelemetry,
  sanitizeSkillRunTelemetryEvent,
} from "./skill-run-telemetry";

const TELEMETRY_FILE = join(USER_DATA, "logs", "skill-run-telemetry.jsonl");

describe("skill-run-telemetry", () => {
  beforeEach(() => {
    mkdirSync(join(USER_DATA, "logs"), { recursive: true });
    if (existsSync(TELEMETRY_FILE)) {
      rmSync(TELEMETRY_FILE);
    }
  });

  afterEach(() => {
    if (existsSync(TELEMETRY_FILE)) {
      rmSync(TELEMETRY_FILE);
    }
  });

  it("writes allow-listed events that can be retrieved by name", () => {
    recordSkillRunTelemetry({
      event: "catalog",
      at: "2026-09-06T15:00:00.000Z",
      outcome: "ok",
    });
    recordSkillRunTelemetry({
      event: "start",
      at: "2026-09-06T15:00:01.000Z",
      featureMode: "skill-first",
      outcome: "ok",
      requestFingerprint: fingerprintRequestId("req-1"),
    });
    const lines = readFileSync(TELEMETRY_FILE, "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { event: string });
    expect(lines.map((row) => row.event)).toEqual(["catalog", "start"]);
  });

  it("drops prompt, arguments, JWT, URL, body, and bytes fields", () => {
    const dirty = {
      event: "start" as const,
      at: "2026-09-06T15:00:00.000Z",
      featureMode: "skill-first" as const,
      prompt: "secret prompt",
      arguments: { prompt: "secret prompt" },
      jwt: "header.payload.sig",
      authorization: "Bearer x",
      backendOrigin: "http://example.invalid",
      text: "result body",
      downloadToken: "tok",
      bytes: "ffff",
    };
    const sanitized = sanitizeSkillRunTelemetryEvent(
      dirty as unknown as Parameters<typeof sanitizeSkillRunTelemetryEvent>[0],
    );
    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain("secret prompt");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("example.invalid");
    expect(serialized).not.toContain("result body");
    expect(Object.keys(sanitized).sort()).toEqual(["at", "event", "featureMode"]);
  });

  it("does not throw when the log path cannot be written", () => {
    rmSync(join(USER_DATA, "logs"), { recursive: true, force: true });
    expect(() =>
      recordSkillRunTelemetry({
        event: "terminal",
        at: "2026-09-06T15:00:00.000Z",
        phase: "failed",
        outcome: "error",
      }),
    ).not.toThrow();
  });
});
