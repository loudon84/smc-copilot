import { describe, expect, it } from "vitest";
import { buildPortalHealthCandidates } from "../src/main/aios/aios-health";

describe("buildPortalHealthCandidates", () => {
  it("includes /zh fallback when home is origin root", () => {
    expect(buildPortalHealthCandidates("http://127.0.0.1:3000")).toEqual([
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3000/zh",
    ]);
  });

  it("does not duplicate when home already ends with /zh", () => {
    const candidates = buildPortalHealthCandidates("http://127.0.0.1:3000/zh");
    expect(candidates[0]).toBe("http://127.0.0.1:3000/zh");
    expect(candidates.filter((u) => u.endsWith("/zh")).length).toBe(1);
  });

  it("does not fall back to /zh when home has a deep path", () => {
    expect(buildPortalHealthCandidates("http://localhost:3000/zh/dashboard")).toEqual([
      "http://localhost:3000/zh/dashboard",
    ]);
  });
});
