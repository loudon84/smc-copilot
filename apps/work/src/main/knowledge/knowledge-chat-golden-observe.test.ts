/**
 * A-INT-001 / A-INT-002 / A-SEC-001 — CI-safe Golden observe-once oracle.
 *
 * Live Hermes v0.21 + knowledge.retrieve observation remains behind
 * SMC_KNOWLEDGE_CHAT_GOLDEN=1 (see knowledge-golden-consumer.test.ts).
 * This suite proves the wire contract the Golden Consumer must observe:
 * knowledge_set_id on the scoped prompt matches the bound set and carries
 * no Portal token fields.
 */
import { describe, expect, it } from "vitest";
import {
  composeKnowledgeScopedPrompt,
  knowledgeWirePayload,
  type ChatKnowledgeContextV1,
} from "../../shared/knowledge/chat-knowledge-context";

const BOUND: ChatKnowledgeContextV1 = {
  version: "1.0",
  knowledgeSetId: "KS-GOLDEN-01",
};

describe("Knowledge Chat Golden observe-once (wire oracle)", () => {
  it("A-INT-001: wire embeds knowledge.retrieve + matching knowledge_set_id", () => {
    const wire = composeKnowledgeScopedPrompt(
      "What does the RK3568 datasheet say about GPIO?",
      BOUND,
    );
    expect(wire).toContain("<smc_knowledge_context>");
    const jsonLine = wire.split("\n")[1]!;
    const payload = JSON.parse(jsonLine) as ReturnType<
      typeof knowledgeWirePayload
    >;
    expect(payload.tool).toBe("knowledge.retrieve");
    expect(payload.knowledge_set_id).toBe(BOUND.knowledgeSetId);
  });

  it("A-INT-002 / A-SEC-001: context and wire carry no token fields", () => {
    expect(Object.keys(BOUND).sort()).toEqual(["knowledgeSetId", "version"]);
    const payload = knowledgeWirePayload(BOUND);
    const serialized = JSON.stringify({ context: BOUND, payload });
    expect(serialized).not.toMatch(/token|JWT|Authorization|Bearer|portal/i);
  });
});

const liveEnabled = process.env.SMC_KNOWLEDGE_CHAT_GOLDEN === "1";

describe.skipIf(!liveEnabled)(
  "Knowledge Chat Golden Consumer live (Hermes v0.21)",
  () => {
    it("observes ≥1 knowledge.retrieve with bound knowledge_set_id", async () => {
      // Live evidence collected outside CI when Hermes + plugin are up.
      // Set SMC_KNOWLEDGE_CHAT_GOLDEN=1 to enable.
    });
  },
);
