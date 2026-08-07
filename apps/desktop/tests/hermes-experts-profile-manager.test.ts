import { describe, it, expect, vi } from "vitest";

vi.mock("../src/main/profile-runtime-db", () => ({
  getRuntimeInstance: vi.fn(),
  getProfile: vi.fn(),
  getProfileByName: vi.fn(),
}));

vi.mock("../src/main/profile-runtime-manager", () => ({
  resolveProfileId: (id: string) => id,
}));

vi.mock("../src/main/hermes-experts/expert-runtime-db", () => ({
  getExpertInstanceByProfileId: vi.fn(),
}));

import { getRuntimeInstance } from "../src/main/profile-runtime-db";
import { getExpertInstanceByProfileId } from "../src/main/hermes-experts/expert-runtime-db";
import { resolveExpertGatewayUrl } from "../src/main/hermes-experts/expert-profile-manager";

describe("resolveExpertGatewayUrl", () => {
  it("returns null for default profile", () => {
    expect(resolveExpertGatewayUrl("default")).toBeNull();
    expect(resolveExpertGatewayUrl(undefined)).toBeNull();
  });

  it("prefers runtime instance base_url", () => {
    vi.mocked(getRuntimeInstance).mockReturnValue({
      base_url: "http://127.0.0.1:9601",
    } as never);
    expect(resolveExpertGatewayUrl("expert.sales.demo")).toBe("http://127.0.0.1:9601");
  });

  it("falls back to expert_instances gateway port", () => {
    vi.mocked(getRuntimeInstance).mockReturnValue(null);
    vi.mocked(getExpertInstanceByProfileId).mockReturnValue({
      expertId: "exp",
      profileId: "expert.sales.demo",
      profileHome: "/tmp",
      status: "installed",
      trustStatus: "untrusted",
      gatewayPort: 9602,
    });
    expect(resolveExpertGatewayUrl("expert.sales.demo")).toBe("http://127.0.0.1:9602");
  });
});
