import { describe, expect, it } from "vitest";
import { hasLocalDashboardWebDist } from "../src/main/dashboard-web-dist";

describe("local dashboard web dist", () => {
  // @lat: [[main-process#Local dashboard web dist]]
  it("reports whether hermes_cli/web_dist/index.html exists without throwing", () => {
    expect(typeof hasLocalDashboardWebDist()).toBe("boolean");
  });
});
