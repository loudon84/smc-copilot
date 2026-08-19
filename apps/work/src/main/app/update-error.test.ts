import { describe, expect, it } from "vitest";
import { normalizeUpdaterError } from "./update-error";

describe("normalizeUpdaterError", () => {
  it("maps latest.yml / YAML failures to UPDATE_METADATA_INVALID", () => {
    const error = normalizeUpdaterError(
      new Error("Cannot parse latest.yml: YAMLException"),
      "check",
      "manual",
    );
    expect(error.code).toBe("UPDATE_METADATA_INVALID");
    expect(error.operation).toBe("check");
    expect(error.retryable).toBe(true);
  });

  it("maps publisher and Authenticode failures to SIGNATURE_INVALID", () => {
    const error = normalizeUpdaterError(
      new Error("New version is not signed by the application owner"),
      "download",
      "manual",
    );
    expect(error.code).toBe("SIGNATURE_INVALID");
    expect(error.retryable).toBe(false);
  });

  it("falls back to the current operation generic code", () => {
    expect(normalizeUpdaterError("ENOTFOUND", "check", "startup").code).toBe("CHECK_FAILED");
    expect(normalizeUpdaterError("socket hang up", "download", "manual").code).toBe(
      "DOWNLOAD_FAILED",
    );
    expect(normalizeUpdaterError("spawn failed", "install", "manual").code).toBe(
      "INSTALL_FAILED",
    );
  });
});
