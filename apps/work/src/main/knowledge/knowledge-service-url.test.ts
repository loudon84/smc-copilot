import { describe, expect, it } from "vitest";
import {
  DEFAULT_KNOWLEDGE_SERVICE_URL,
  resolveKnowledgeServiceUrl,
} from "./knowledge-service-url";

describe("knowledge-service-url", () => {
  it("defaults to the loopback Knowledge service", () => {
    expect(resolveKnowledgeServiceUrl({})).toBe(DEFAULT_KNOWLEDGE_SERVICE_URL);
  });

  it("accepts an explicit origin override", () => {
    expect(
      resolveKnowledgeServiceUrl({
        SMC_KNOWLEDGE_SERVICE_URL: "https://knowledge.example:4530/extra",
      }),
    ).toBe("https://knowledge.example:4530");
  });

  it("rejects an invalid URL", () => {
    expect(() =>
      resolveKnowledgeServiceUrl({ SMC_KNOWLEDGE_SERVICE_URL: "not-a-url" }),
    ).toThrow("KNOWLEDGE_SERVICE_URL_INVALID");
  });
});
