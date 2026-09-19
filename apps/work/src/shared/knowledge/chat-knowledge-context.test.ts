import { describe, expect, it } from "vitest";
import {
  assertChatKnowledgeContextV1,
  composeKnowledgeScopedPrompt,
  isChatKnowledgeContextV1,
  KNOWLEDGE_SET_REQUIRED,
  knowledgeWirePayload,
  stripKnowledgeScopedPromptPrefix,
  type ChatKnowledgeContextV1,
} from "./chat-knowledge-context";

const KS_A: ChatKnowledgeContextV1 = {
  version: "1.0",
  knowledgeSetId: "KS-A",
};

describe("chat-knowledge-context", () => {
  it("rejects empty / token-bearing shapes", () => {
    expect(isChatKnowledgeContextV1(null)).toBe(false);
    expect(isChatKnowledgeContextV1({ version: "1.0", knowledgeSetId: "  " })).toBe(
      false,
    );
    expect(
      isChatKnowledgeContextV1({
        version: "1.0",
        knowledgeSetId: "KS-A",
        token: "secret",
      }),
    ).toBe(false);
    expect(() => assertChatKnowledgeContextV1({ version: "1.0" })).toThrow(
      KNOWLEDGE_SET_REQUIRED,
    );
  });

  it("null context is zero-change", () => {
    const input = "查询 RK3568";
    expect(composeKnowledgeScopedPrompt(input, null)).toBe(input);
  });

  it("compose is deterministic and places JSON before prompt", () => {
    const input = '查询 "RK3568" & <script>';
    const a = composeKnowledgeScopedPrompt(input, KS_A);
    const b = composeKnowledgeScopedPrompt(input, KS_A);
    expect(a).toBe(b);
    expect(a.startsWith("<smc_knowledge_context>\n")).toBe(true);
    expect(a.endsWith(input)).toBe(true);
    const jsonLine = a.split("\n")[1]!;
    const parsed = JSON.parse(jsonLine) as ReturnType<typeof knowledgeWirePayload>;
    expect(parsed.knowledge_set_id).toBe("KS-A");
    expect(parsed.tool).toBe("knowledge.retrieve");
    expect(parsed.version).toBe("1.0");
    expect(JSON.stringify(parsed)).not.toMatch(/token|JWT|Authorization|Bearer/i);
  });

  it("wire payload has no credential fields", () => {
    const payload = knowledgeWirePayload(KS_A);
    expect(Object.keys(payload).sort()).toEqual([
      "knowledge_set_id",
      "policy",
      "tool",
      "version",
    ]);
  });

  it("stripKnowledgeScopedPromptPrefix restores visible user prompt", () => {
    const input = "MT6571 电压参数";
    const wire = composeKnowledgeScopedPrompt(input, KS_A);
    expect(stripKnowledgeScopedPromptPrefix(wire)).toBe(input);
    expect(stripKnowledgeScopedPromptPrefix(input)).toBe(input);
    expect(stripKnowledgeScopedPromptPrefix("")).toBe("");
  });
});
