import { describe, it, expect } from "vitest";
import {
  externalBrowserPartition,
  WEB_OPERATOR_PARTITION,
  PORTAL_PARTITION,
  SHELL_PARTITIONS,
} from "../src/shared/shell/browser-partitions";

describe("externalBrowserPartition", () => {
  it("maps layer id to per-tab persist partition", () => {
    expect(externalBrowserPartition("external-browser:abc-123")).toBe(
      "persist:external-browser-abc-123",
    );
  });

  it("accepts bare uuid suffix", () => {
    expect(externalBrowserPartition("abc-123")).toBe("persist:external-browser-abc-123");
  });
});

describe("partition constants (V3.3)", () => {
  it("exports canonical portal and web-operator partitions", () => {
    expect(PORTAL_PARTITION).toBe("persist:aios-home");
    expect(WEB_OPERATOR_PARTITION).toBe("persist:web-operator");
    expect(SHELL_PARTITIONS.PORTAL).toBe("persist:aios-home");
  });
});
