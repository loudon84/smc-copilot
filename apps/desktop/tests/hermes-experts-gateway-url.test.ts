import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetConnectionConfig = vi.fn(() => ({ mode: "local" as const }));

vi.mock("../src/main/config", () => ({
  getConnectionConfig: () => mockGetConnectionConfig(),
}));

vi.mock("../src/main/ssh-tunnel", () => ({
  getSshTunnelUrl: () => null,
}));

vi.mock("../src/main/hermes-experts/expert-profile-manager", () => ({
  resolveExpertGatewayUrl: vi.fn(),
  isExpertManagedProfile: vi.fn(),
}));

import { resolveExpertGatewayUrl } from "../src/main/hermes-experts/expert-profile-manager";
import { getApiUrl } from "../src/main/hermes";

describe("getApiUrl profile routing", () => {
  beforeEach(() => {
    mockGetConnectionConfig.mockReturnValue({ mode: "local" });
    vi.mocked(resolveExpertGatewayUrl).mockReset();
  });

  it("uses expert gateway url when profile is expert-managed", () => {
    vi.mocked(resolveExpertGatewayUrl).mockReturnValue("http://127.0.0.1:9603");
    expect(getApiUrl("expert.sales.customer-researcher")).toBe("http://127.0.0.1:9603");
  });

  it("falls back to default local gateway", () => {
    vi.mocked(resolveExpertGatewayUrl).mockReturnValue(null);
    expect(getApiUrl("default")).toBe("http://127.0.0.1:8642");
  });
});
