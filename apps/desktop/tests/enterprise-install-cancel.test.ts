import { describe, it, expect, beforeEach } from "vitest";
import {
  requestEnterpriseInstallCancel,
  resetEnterpriseInstallCancel,
  isEnterpriseInstallCancelled,
} from "../src/main/enterprise/install-cancel";

describe("enterprise install cancel", () => {
  beforeEach(() => {
    resetEnterpriseInstallCancel();
  });

  it("sets and clears cancel flag", () => {
    expect(isEnterpriseInstallCancelled()).toBe(false);
    requestEnterpriseInstallCancel();
    expect(isEnterpriseInstallCancelled()).toBe(true);
    resetEnterpriseInstallCancel();
    expect(isEnterpriseInstallCancelled()).toBe(false);
  });
});
