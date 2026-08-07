import { describe, expect, it, beforeEach } from "vitest";
import {
  buildAllowedOrigins,
  isAllowedUrl,
} from "../src/shared/auth/auth-url";
import {
  clearTokenInjectionPolicy,
  getTokenInjectionPolicy,
  updateTokenInjectionPolicy,
} from "../src/main/auth/token-injection-policy";

const endpoint = {
  backendUrl: "http://127.0.0.1:8000",
  authPrefix: "/api/auth",
  aiosHomeUrl: "http://127.0.0.1:3000",
};

describe("token injection policy", () => {
  beforeEach(() => {
    clearTokenInjectionPolicy();
  });

  it("builds allowed origins from endpoint config", () => {
    const origins = buildAllowedOrigins(endpoint);
    expect(origins).toContain("http://127.0.0.1:3000");
    expect(origins).toContain("http://127.0.0.1:8000");
  });

  it("isAllowedUrl respects whitelist", () => {
    const origins = buildAllowedOrigins(endpoint);
    expect(isAllowedUrl("http://127.0.0.1:3000/dashboard", origins)).toBe(true);
    expect(isAllowedUrl("http://evil.example.com/", origins)).toBe(false);
  });

  it("disables injection when policy cleared", () => {
    updateTokenInjectionPolicy(endpoint, true);
    expect(getTokenInjectionPolicy().enabled).toBe(true);
    clearTokenInjectionPolicy();
    expect(getTokenInjectionPolicy().enabled).toBe(false);
    expect(getTokenInjectionPolicy().allowedOrigins).toEqual([]);
  });

  it("old origin not allowed after aiosHomeUrl change", () => {
    updateTokenInjectionPolicy(endpoint, true);
    const oldOrigins = buildAllowedOrigins(endpoint);
    expect(isAllowedUrl("http://127.0.0.1:3000/app", oldOrigins)).toBe(true);

    const newEndpoint = { ...endpoint, aiosHomeUrl: "http://127.0.0.1:3001" };
    updateTokenInjectionPolicy(newEndpoint, true);
    const newOrigins = getTokenInjectionPolicy().allowedOrigins;
    expect(isAllowedUrl("http://127.0.0.1:3000/app", newOrigins)).toBe(false);
    expect(isAllowedUrl("http://127.0.0.1:3001/app", newOrigins)).toBe(true);
  });
});
