import { describe, expect, it, vi, beforeEach } from "vitest";

const listModelsMock = vi.fn();
const readEnvMock = vi.fn();

vi.mock("../src/main/models", () => ({
  listModels: () => listModelsMock(),
  resolveSavedModelById: (id: string) =>
    listModelsMock().find((m: { id: string }) => m.id === id) ?? null,
}));

vi.mock("../src/main/config", () => ({
  readEnv: (...args: unknown[]) => readEnvMock(...args),
}));

import { buildGatewayChatCompletionsBody } from "../src/main/hermes-default-chat/hermes-default-chat-request";

describe("buildGatewayChatCompletionsBody", () => {
  beforeEach(() => {
    listModelsMock.mockReturnValue([
      {
        id: "uuid-deepseek",
        name: "deepseek-v4-flash",
        provider: "custom",
        model: "deepseek-v4-flash",
        baseUrl: "https://api.deepseek.com/v1",
        apiKeyEnv: "DEEPSEEK_API_KEY",
        createdAt: 1,
      },
    ]);
    readEnvMock.mockReturnValue({ DEEPSEEK_API_KEY: "test-deepseek-key" });
  });

  it("uses API server model name and passes request-level provider/base_url", () => {
    const body = buildGatewayChatCompletionsBody(
      [{ role: "user", content: "hi" }],
      undefined,
      "uuid-deepseek",
      "hermes-agent",
    );
    expect(body.model).toBe("hermes-agent");
    expect(body.provider).toBe("custom");
    expect(body.base_url).toBe("https://api.deepseek.com/v1");
    expect(body.api_key).toBe("test-deepseek-key");
    expect(body.stream).toBe(true);
  });

  it("infers api_key from base URL when apiKeyEnv is missing", () => {
    listModelsMock.mockReturnValue([
      {
        id: "uuid-deepseek-legacy",
        name: "deepseek-v4-flash",
        provider: "custom",
        model: "deepseek-v4-flash",
        baseUrl: "https://api.deepseek.com/v1",
        createdAt: 1,
      },
    ]);
    readEnvMock.mockReturnValue({ DEEPSEEK_API_KEY: "legacy-inferred-key" });

    const body = buildGatewayChatCompletionsBody(
      [{ role: "user", content: "hi" }],
      undefined,
      "uuid-deepseek-legacy",
      "hermes-agent",
    );
    expect(body.api_key).toBe("legacy-inferred-key");
  });

  it("falls back to API server model when model_id is absent", () => {
    const body = buildGatewayChatCompletionsBody(
      [{ role: "user", content: "hi" }],
      undefined,
      undefined,
      "hermes-agent",
    );
    expect(body.model).toBe("hermes-agent");
    expect(body.provider).toBeUndefined();
    expect(body.base_url).toBeUndefined();
  });
});
