import { describe, expect, it } from "vitest";
import {
  isManagedHermesGatewayProcess,
  type GatewayListenerProcess,
} from "./gateway-probe";

const EXPECTED = String.raw`D:\Programs\SMC\Hermes\bin\hermes.exe`;
const MANAGED_PYTHON = String.raw`D:\Programs\SMC\Hermes\python\python.exe`;
const OTHER_ROOT_PYTHON = String.raw`C:\Python311\python.exe`;
const FOREIGN_EXE = String.raw`C:\Windows\System32\svchost.exe`;

function listener(
  executablePath: string,
  commandLine?: string | null,
): GatewayListenerProcess {
  return { executablePath, commandLine };
}

describe("isManagedHermesGatewayProcess", () => {
  it("matches expected hermes.exe directly", () => {
    expect(
      isManagedHermesGatewayProcess(
        EXPECTED,
        listener(EXPECTED, "ignored"),
      ),
    ).toBe(true);
  });

  it("matches same-install-root python launcher with gateway run tokens", () => {
    const commandLine = `python.exe "${EXPECTED}" gateway run --replace`;
    expect(
      isManagedHermesGatewayProcess(
        EXPECTED,
        listener(MANAGED_PYTHON, commandLine),
      ),
    ).toBe(true);
  });

  it("rejects other-root python even with hermes gateway run cmdline", () => {
    const commandLine = `python.exe "${EXPECTED}" gateway run --replace`;
    expect(
      isManagedHermesGatewayProcess(
        EXPECTED,
        listener(OTHER_ROOT_PYTHON, commandLine),
      ),
    ).toBe(false);
  });

  it("rejects managed python without CommandLine", () => {
    expect(
      isManagedHermesGatewayProcess(EXPECTED, listener(MANAGED_PYTHON, null)),
    ).toBe("missing_command_line");
  });

  it("rejects managed python missing gateway or run tokens", () => {
    expect(
      isManagedHermesGatewayProcess(
        EXPECTED,
        listener(MANAGED_PYTHON, `"${EXPECTED}" gateway`),
      ),
    ).toBe(false);
    expect(
      isManagedHermesGatewayProcess(
        EXPECTED,
        listener(MANAGED_PYTHON, `"${EXPECTED}" run`),
      ),
    ).toBe(false);
  });

  it("rejects managed python whose CommandLine lacks expected CLI path", () => {
    expect(
      isManagedHermesGatewayProcess(
        EXPECTED,
        listener(MANAGED_PYTHON, "python.exe hermes.exe gateway run"),
      ),
    ).toBe(false);
  });

  it("rejects foreign executable", () => {
    expect(
      isManagedHermesGatewayProcess(
        EXPECTED,
        listener(FOREIGN_EXE, "svchost.exe -k netsvcs"),
      ),
    ).toBe(false);
  });
});
