import { describe, expect, it } from "vitest";
import { resolveWebContentsHostBounds } from "../src/renderer/src/components/shell/web-contents-host-bounds";

describe("resolveWebContentsHostBounds", () => {
  it("expands height to workspace bottom when anchor under-reports", () => {
    const bounds = resolveWebContentsHostBounds(
      { left: 65, top: 109, width: 1863, height: 800 },
      980,
    );
    expect(bounds).toEqual({
      x: 65,
      y: 109,
      width: 1863,
      height: 871,
    });
  });

  it("keeps anchor height when already fills workspace", () => {
    const bounds = resolveWebContentsHostBounds(
      { left: 0, top: 100, width: 1200, height: 900 },
      1000,
    );
    expect(bounds?.height).toBe(900);
  });
});
