import { describe, it, expect, beforeEach } from "vitest";
import { shouldInjectTokenForUrl } from "../src/main/auth/token-inject-url";
import {
  clearTokenInjectionPolicy,
  updateTokenInjectionPolicy,
} from "../src/main/auth/token-injection-policy";

const endpoint = {
  backendUrl: "http://127.0.0.1:8000",
  authPrefix: "/api/auth",
  aiosHomeUrl: "http://127.0.0.1:3000",
};

describe("shouldInjectTokenForUrl", () => {
  beforeEach(() => {
    clearTokenInjectionPolicy();
  });

  it("allows whitelisted origins when policy enabled", () => {
    updateTokenInjectionPolicy(endpoint, true);
    expect(shouldInjectTokenForUrl("http://127.0.0.1:3000/")).toBe(true);
    expect(shouldInjectTokenForUrl("http://127.0.0.1:8000/api")).toBe(true);
  });

  it("rejects non-whitelisted origins", () => {
    updateTokenInjectionPolicy(endpoint, true);
    expect(shouldInjectTokenForUrl("http://127.0.0.1:8642/health")).toBe(false);
    expect(shouldInjectTokenForUrl("https://example.com:3000/")).toBe(false);
  });

  it("rejects all URLs when policy disabled", () => {
    updateTokenInjectionPolicy(endpoint, false);
    expect(shouldInjectTokenForUrl("http://127.0.0.1:3000/")).toBe(false);
  });
});
