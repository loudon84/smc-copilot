import { describe, expect, it } from "vitest";
import {
  ensureLocalDashboardWebDist,
  hasLocalDashboardWebDist,
} from "../src/main/dashboard-web-dist";

describe("local dashboard web dist", () => {
  it("does not treat a local hermes_cli/web_dist as a Work-owned build", () => {
    expect(hasLocalDashboardWebDist()).toBe(false);
  });

  it("does not install or build a local dashboard web workspace", async () => {
    await expect(ensureLocalDashboardWebDist()).resolves.toBe(false);
  });
});
