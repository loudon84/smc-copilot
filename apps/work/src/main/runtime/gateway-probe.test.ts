import { describe, expect, it } from "vitest";
import {
  evaluateGatewayListeners,
  isManagedHermesGatewayProcess,
  type GatewayListenerProcess,
} from "./gateway-probe";

const PROGRAM_ROOT = String.raw`D:\Programs\SMC\Hermes`;
const MANAGED_PYTHON = String.raw`D:\Programs\SMC\Hermes\python\python.exe`;
const MANAGED_HERMES = String.raw`D:\Programs\SMC\Hermes\bin\hermes.exe`;
const MANAGED_NODE = String.raw`D:\Programs\SMC\Hermes\node\node.exe`;
const SIBLING_EXTRA = String.raw`D:\Programs\SMC\HermesExtra\python\python.exe`;
const SIBLING_EVIL = String.raw`D:\Programs\SMC\Hermes-evil\python\python.exe`;
const OTHER_ROOT_PYTHON = String.raw`C:\Python311\python.exe`;
const FOREIGN_EXE = String.raw`C:\Windows\System32\svchost.exe`;
const APPDATA_HERMES = String.raw`C:\Users\test\AppData\Local\hermes\hermes.exe`;

function listener(
  executablePath: string,
  commandLine?: string | null,
): GatewayListenerProcess {
  return { executablePath, commandLine };
}

describe("isManagedHermesGatewayProcess", () => {
  it("matches ProgramRoot hermes.exe without CommandLine tokens", () => {
    expect(
      isManagedHermesGatewayProcess(PROGRAM_ROOT, listener(MANAGED_HERMES)),
    ).toBe(true);
  });

  it("matches ProgramRoot python -m hermes_cli.main even when CommandLine lacks hermes.exe", () => {
    expect(
      isManagedHermesGatewayProcess(
        PROGRAM_ROOT,
        listener(MANAGED_PYTHON, "python.exe -m hermes_cli.main gateway run"),
      ),
    ).toBe(true);
  });

  it("matches ProgramRoot python with missing CommandLine", () => {
    expect(
      isManagedHermesGatewayProcess(
        PROGRAM_ROOT,
        listener(MANAGED_PYTHON, null),
      ),
    ).toBe(true);
  });

  it("matches ProgramRoot node.exe", () => {
    expect(
      isManagedHermesGatewayProcess(PROGRAM_ROOT, listener(MANAGED_NODE)),
    ).toBe(true);
  });

  it("rejects sibling HermesExtra prefix", () => {
    expect(
      isManagedHermesGatewayProcess(PROGRAM_ROOT, listener(SIBLING_EXTRA)),
    ).toBe(false);
  });

  it("rejects sibling Hermes-evil prefix", () => {
    expect(
      isManagedHermesGatewayProcess(PROGRAM_ROOT, listener(SIBLING_EVIL)),
    ).toBe(false);
  });

  it("rejects other-root python even with hermes gateway run cmdline", () => {
    const commandLine = `python.exe "${MANAGED_HERMES}" gateway run --replace`;
    expect(
      isManagedHermesGatewayProcess(
        PROGRAM_ROOT,
        listener(OTHER_ROOT_PYTHON, commandLine),
      ),
    ).toBe(false);
  });

  it("rejects foreign executable", () => {
    expect(
      isManagedHermesGatewayProcess(
        PROGRAM_ROOT,
        listener(FOREIGN_EXE, "svchost.exe -k netsvcs"),
      ),
    ).toBe(false);
  });
});

describe("evaluateGatewayListeners", () => {
  it("row 1: all in-boundary listeners are match regardless of PID count", () => {
    const result = evaluateGatewayListeners(PROGRAM_ROOT, [
      listener(MANAGED_PYTHON, "python.exe -m hermes_cli.main gateway run"),
      listener(MANAGED_HERMES),
    ]);
    expect(result).toEqual({
      status: "match",
      actualPath: MANAGED_PYTHON,
    });
  });

  it("row 2: exactly one out-of-boundary listener is mismatch", () => {
    const result = evaluateGatewayListeners(PROGRAM_ROOT, [
      listener(APPDATA_HERMES),
    ]);
    expect(result).toEqual({
      status: "mismatch",
      actualPath: APPDATA_HERMES,
    });
  });

  it("row 3: multiple listeners not all in-boundary are inspect_failed, not mismatch", () => {
    const result = evaluateGatewayListeners(PROGRAM_ROOT, [
      listener(MANAGED_PYTHON),
      listener(FOREIGN_EXE),
    ]);
    expect(result).toEqual({
      status: "inspect_failed",
      reason: "mixed_listeners",
    });
  });

  it("row 5: empty listener list is no_listener", () => {
    expect(evaluateGatewayListeners(PROGRAM_ROOT, [])).toEqual({
      status: "no_listener",
    });
  });

  it("empty ProgramRoot is inspect_failed", () => {
    expect(evaluateGatewayListeners("  ", [listener(MANAGED_PYTHON)])).toEqual({
      status: "inspect_failed",
      reason: "missing_program_root",
    });
  });
});
