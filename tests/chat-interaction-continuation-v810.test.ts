import { describe, expect, it, beforeEach } from "vitest";
import {
  createHermesInteractionContinuationAdapter,
  __resetContinuationCapabilityCacheForTests,
} from "../src/main/chat-runtime/hermes-interaction-continuation-adapter";
import {
  HermesChatCommandUnsupportedError,
} from "../src/main/chat-runtime/hermes-chat-command-adapter";

describe("interaction continuation adapter (v8.1)", () => {
  beforeEach(() => {
    __resetContinuationCapabilityCacheForTests();
  });

  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Continuation unsupported fails loudly]]
  it("unsupported error code is GATEWAY_UNSUPPORTED", () => {
    const err = new HermesChatCommandUnsupportedError("nope");
    expect(err.code).toBe("GATEWAY_UNSUPPORTED");
  });
});
