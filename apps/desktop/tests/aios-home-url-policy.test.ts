import { describe, expect, it } from "vitest";
import {
  portalOriginsMatch,
  shouldForceReloadAiosHome,
} from "../src/shared/aios/aios-home-url-policy";

describe("portalOriginsMatch", () => {
  it("treats localhost and 127.0.0.1 as equivalent", () => {
    expect(
      portalOriginsMatch(
        "http://localhost:3000/zh/login",
        "http://127.0.0.1:3000/zh/dashboard",
      ),
    ).toBe(true);
  });
});

describe("shouldForceReloadAiosHome", () => {
  it("does not reload when user navigated within same portal origin", () => {
    expect(
      shouldForceReloadAiosHome(
        "http://localhost:3000/zh/login",
        "http://127.0.0.1:3000/zh/dashboard",
        "active",
      ),
    ).toBe(false);
  });

  it("reloads when origin changes", () => {
    expect(
      shouldForceReloadAiosHome(
        "http://localhost:3000/zh",
        "http://127.0.0.1:4000/zh",
        "active",
      ),
    ).toBe(true);
  });

  it("reloads blank shell URL", () => {
    expect(shouldForceReloadAiosHome("", "http://127.0.0.1:3000/zh", "ready")).toBe(
      true,
    );
  });
});
