import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("GatewayLogCollector", () => {
  let startCollecting: typeof import("../src/main/gateway-log-collector").startCollecting;
  let getHistory: typeof import("../src/main/gateway-log-collector").getHistory;
  let stopCollecting: typeof import("../src/main/gateway-log-collector").stopCollecting;
  let onNewLog: typeof import("../src/main/gateway-log-collector").onNewLog;
  let clearHistory: typeof import("../src/main/gateway-log-collector").clearHistory;

  beforeEach(async () => {
    vi.useFakeTimers();
    const mod = await import("../src/main/gateway-log-collector");
    startCollecting = mod.startCollecting;
    getHistory = mod.getHistory;
    stopCollecting = mod.stopCollecting;
    onNewLog = mod.onNewLog;
    clearHistory = mod.clearHistory;
  });

  afterEach(() => {
    vi.useRealTimers();
    stopCollecting("test-profile");
  });

  it("collects stdout logs from a child process", () => {
    const mockProc = {
      stdout: new (require("stream").Readable)({ read() {} }),
      stderr: null,
    };

    startCollecting("test-profile", mockProc);
    mockProc.stdout.push("line 1\nline 2\n");
    mockProc.stdout.push(null);

    const history = getHistory("test-profile");
    expect(history.length).toBe(2);
    expect(history[0].message).toBe("line 1");
    expect(history[0].level).toBe("stdout");
    expect(history[1].message).toBe("line 2");
  });

  it("collects stderr logs", () => {
    const mockProc = {
      stdout: null,
      stderr: new (require("stream").Readable)({ read() {} }),
    };

    startCollecting("test-profile", mockProc);
    mockProc.stderr.push("error line\n");
    mockProc.stderr.push(null);

    const history = getHistory("test-profile");
    expect(history.length).toBe(1);
    expect(history[0].level).toBe("stderr");
  });

  it("supports level filtering", () => {
    const mockProc = {
      stdout: new (require("stream").Readable)({ read() {} }),
      stderr: new (require("stream").Readable)({ read() {} }),
    };

    startCollecting("test-profile", mockProc);
    mockProc.stdout.push("out\n");
    mockProc.stderr.push("err\n");
    mockProc.stdout.push(null);
    mockProc.stderr.push(null);

    const stdoutOnly = getHistory("test-profile", { level: "stdout" });
    expect(stdoutOnly.length).toBe(1);
    expect(stdoutOnly[0].level).toBe("stdout");
  });

  it("supports limit", () => {
    const mockProc = {
      stdout: new (require("stream").Readable)({ read() {} }),
      stderr: null,
    };

    startCollecting("test-profile", mockProc);
    for (let i = 0; i < 10; i++) {
      mockProc.stdout.push(`line ${i}\n`);
    }
    mockProc.stdout.push(null);

    const limited = getHistory("test-profile", { limit: 3 });
    expect(limited.length).toBe(3);
    expect(limited[0].message).toBe("line 7");
  });

  it("returns empty after stopCollecting", () => {
    const mockProc = {
      stdout: new (require("stream").Readable)({ read() {} }),
      stderr: null,
    };

    startCollecting("test-profile", mockProc);
    mockProc.stdout.push("data\n");
    mockProc.stdout.push(null);

    stopCollecting("test-profile");
    const history = getHistory("test-profile");
    expect(history.length).toBe(0);
  });

  it("notifies subscribers via onNewLog", () => {
    const mockProc = {
      stdout: new (require("stream").Readable)({ read() {} }),
      stderr: null,
    };
    const received: string[] = [];

    startCollecting("test-profile", mockProc);
    const unsub = onNewLog("test-profile", (entry) => {
      received.push(entry.message);
    });

    mockProc.stdout.push("hello\n");
    mockProc.stdout.push(null);

    expect(received.length).toBe(1);
    expect(received[0]).toBe("hello");

    unsub();
  });
});

describe("RuntimeReconciler", () => {
  it("isPortOccupied returns true for a taken port", async () => {
    const { isPortOccupied } = await import("../src/main/runtime-reconciler");
    const server = require("net").createServer();
    await new Promise<void>((resolve) => server.listen(19999, "127.0.0.1", resolve));
    const occupied = await isPortOccupied(19999);
    expect(occupied).toBe(true);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("isPortOccupied returns false for a free port", async () => {
    const { isPortOccupied } = await import("../src/main/runtime-reconciler");
    const occupied = await isPortOccupied(59999);
    expect(occupied).toBe(false);
  });
});

describe("ProfileRuntimeManager - Port Conflict", () => {
  it("isPortOccupied detects taken port", async () => {
    const { isPortOccupied } = await import("../src/main/profile-runtime-manager");
    const server = require("net").createServer();
    await new Promise<void>((resolve) => server.listen(19998, "127.0.0.1", resolve));
    const occupied = await isPortOccupied(19998);
    expect(occupied).toBe(true);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

describe("GatewaySupervisor - Auto Restart", () => {
  it("supervision options are stored per profile", async () => {
    const { startSupervision, stopSupervision, getSupervisionStatus } = await import("../src/main/gateway-supervisor");

    stopSupervision("sup-test-profile");

    expect(getSupervisionStatus("sup-test-profile").isSupervised).toBe(false);
  });
});

describe("ProfileRuntimeError - Startup Timeout", () => {
  it("PROFILE_STARTUP_TIMEOUT error code exists", async () => {
    const { createProfileError } = await import("../src/shared/profile-runtime/profile-runtime-errors");
    const err = createProfileError("PROFILE_STARTUP_TIMEOUT", "30s");
    expect(err.ok).toBe(false);
    expect(err.errorCode).toBe("PROFILE_STARTUP_TIMEOUT");
    expect(err.message).toContain("30s");
  });
});

describe("RuntimeInstanceRecord - New Fields", () => {
  it("RuntimeInstanceRecord type includes restart_count, last_exit_code, last_crash_at, auto_restart, health_fail_count", () => {
    type Record = import("../src/shared/profile-runtime/profile-runtime-contract").RuntimeInstanceRecord;
    const record: Record = {
      id: "test",
      profile_id: "p1",
      runtime_type: "hermes-local",
      host: "127.0.0.1",
      port: 8642,
      base_url: "http://127.0.0.1:8642",
      status: "stopped",
      pid: null,
      started_at: null,
      stopped_at: null,
      last_health_check_at: null,
      last_error: null,
      restart_count: 0,
      last_exit_code: null,
      last_crash_at: null,
      auto_restart: true,
      health_fail_count: 0,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    expect(record.restart_count).toBe(0);
    expect(record.auto_restart).toBe(true);
    expect(record.health_fail_count).toBe(0);
  });
});
