import { describe, expect, it } from "vitest";
import { remapServeEventIdentity } from "../serve-event-identity";

describe("remapServeEventIdentity", () => {
  const identity = {
    clientRunId: "run-msn17pxo-nqbmpd",
    clientTurnId: "turn-1786361769492-u6tqb2w",
    serverRunId: "d92ffa2a-81f3-4bdd-ae83-b44a03dcc2cd",
    serverTurnId: "0eb727d7-72a5-4022-843d-692b3fd793c7",
  };

  it("remaps server UUIDs to client ids so Renderer filters accept progress", () => {
    const mapped = remapServeEventIdentity(
      {
        runId: identity.serverRunId,
        turnId: identity.serverTurnId,
        type: "agent.message.delta",
      },
      identity,
    );
    expect(mapped.runId).toBe(identity.clientRunId);
    expect(mapped.turnId).toBe(identity.clientTurnId);
  });

  it("keeps unrelated turn ids (queued sibling turns)", () => {
    const otherTurn = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const mapped = remapServeEventIdentity(
      { runId: identity.serverRunId, turnId: otherTurn },
      identity,
    );
    expect(mapped.runId).toBe(identity.clientRunId);
    expect(mapped.turnId).toBe(otherTurn);
  });
});
