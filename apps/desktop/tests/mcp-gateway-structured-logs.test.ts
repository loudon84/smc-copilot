import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => TEST_LOG_DIR),
  },
}));

const TEST_LOG_DIR = join(tmpdir(), `mcp-gateway-log-test-${Date.now()}`);

import {
  readStructuredMcpGatewayLogs,
  writeMcpSkillGatewayLog,
} from "../src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-log";

describe("readStructuredMcpGatewayLogs", () => {
  beforeEach(() => {
    rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    mkdirSync(join(TEST_LOG_DIR, "logs"), { recursive: true });
  });

  it("parses JSONL log entries and redacts bearer tokens", () => {
    writeMcpSkillGatewayLog({
      time: "2026-06-14T12:00:00.000Z",
      level: "info",
      method: "tools/list",
      message: "Authorization: Bearer secret-token-123",
    });

    const entries = readStructuredMcpGatewayLogs(10);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe("info");
    expect(entries[0]?.method).toBe("tools/list");
    expect(entries[0]?.message).toContain("[REDACTED]");
    expect(entries[0]?.message).not.toContain("secret-token-123");
  });

  it("returns empty array when log file missing", () => {
    if (existsSync(join(TEST_LOG_DIR, "logs", "mcp-skill-gateway-proxy.log"))) {
      rmSync(join(TEST_LOG_DIR, "logs", "mcp-skill-gateway-proxy.log"));
    }
    expect(readStructuredMcpGatewayLogs()).toEqual([]);
  });

  it("skips invalid JSON lines", () => {
    const logPath = join(TEST_LOG_DIR, "logs", "mcp-skill-gateway-proxy.log");
    writeFileSync(
      logPath,
      '{"time":"2026-06-14T12:00:00.000Z","level":"warn","message":"ok"}\nnot-json\n',
      "utf-8",
    );
    const entries = readStructuredMcpGatewayLogs(10);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe("warn");
  });
});
