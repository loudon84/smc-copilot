import { describe, expect, it } from "vitest";
import type {
  ChatRuntimeCommand,
  ChatRuntimeCommandResult,
} from "../src/shared/chat-runtime/chat-runtime-contract";
import {
  createPendingApproval,
  createPendingClarify,
  validatePendingInteraction,
} from "../src/main/chat-runtime/chat-interaction-registry";
import { __test as hermesCommandTest } from "../src/main/chat-runtime/hermes-chat-command-adapter";

describe("chat-runtime command contract (v8.0.5)", () => {
  it("successful result carries runId/turnId/requestId/acceptedAt", () => {
    const ok: ChatRuntimeCommandResult = {
      ok: true,
      runId: "run-1",
      turnId: "turn-1",
      requestId: "req-1",
      acceptedAt: 1,
    };
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.runId).toBe("run-1");
      expect(ok.turnId).toBe("turn-1");
      expect(ok.requestId).toBe("req-1");
      expect(ok.acceptedAt).toBe(1);
    }
  });

  it("failure result uses typed error codes", () => {
    const codes = [
      "RUN_NOT_FOUND",
      "TURN_MISMATCH",
      "REQUEST_NOT_FOUND",
      "REQUEST_ALREADY_RESOLVED",
      "INVALID_STATE",
      "GATEWAY_UNSUPPORTED",
      "COMMAND_FAILED",
      "INVALID_INPUT",
    ] as const;
    for (const code of codes) {
      const fail: ChatRuntimeCommandResult = {
        ok: false,
        code,
        error: code,
      };
      expect(fail.ok).toBe(false);
      if (!fail.ok) expect(fail.code).toBe(code);
    }
  });

  it("command shape requires runId + turnId + requestId", () => {
    const command: ChatRuntimeCommand = {
      type: "clarify.respond",
      runId: "run-1",
      turnId: "turn-1",
      requestId: "req-1",
      answer: "yes",
    };
    expect(command.runId).toBeTruthy();
    expect(command.turnId).toBeTruthy();
    expect(command.requestId).toBeTruthy();
  });
});

describe("chat-interaction-registry", () => {
  it("rejects turn mismatch", () => {
    const pending = createPendingClarify("req-1", "turn-a");
    expect(
      validatePendingInteraction({
        pending,
        commandTurnId: "turn-b",
        commandType: "clarify.respond",
        expectKind: "clarify",
      }),
    ).toBe("TURN_MISMATCH");
  });

  it("rejects already resolved", () => {
    const pending = createPendingClarify("req-1", "turn-a");
    pending.resolved = true;
    expect(
      validatePendingInteraction({
        pending,
        commandTurnId: "turn-a",
        commandType: "clarify.respond",
        expectKind: "clarify",
      }),
    ).toBe("REQUEST_ALREADY_RESOLVED");
  });

  it("rejects missing request", () => {
    expect(
      validatePendingInteraction({
        pending: undefined,
        commandTurnId: "turn-a",
        commandType: "approval.approve",
        expectKind: "approval",
      }),
    ).toBe("REQUEST_NOT_FOUND");
  });

  it("rejects wrong kind (clarify vs approval)", () => {
    const pending = createPendingApproval("req-1", "turn-a", "shell");
    expect(
      validatePendingInteraction({
        pending,
        commandTurnId: "turn-a",
        commandType: "clarify.respond",
        expectKind: "clarify",
      }),
    ).toBe("INVALID_STATE");
  });

  it("accepts matching clarify respond", () => {
    const pending = createPendingClarify("req-1", "turn-a");
    expect(
      validatePendingInteraction({
        pending,
        commandTurnId: "turn-a",
        commandType: "clarify.respond",
        expectKind: "clarify",
      }),
    ).toBeNull();
  });
});

describe("hermes-chat-command-adapter follow-up messages", () => {
  it("builds clarify follow-up with prefix and request id", () => {
    const msg = hermesCommandTest.buildClarifyFollowUp("req-9", "choose A");
    expect(msg).toContain("[[hermes.clarify.response]]");
    expect(msg).toContain("request_id: req-9");
    expect(msg).toContain("answer: choose A");
  });

  it("builds approval follow-up with decision", () => {
    const msg = hermesCommandTest.buildApprovalFollowUp(
      "req-2",
      "denied",
      "too risky",
    );
    expect(msg).toContain("[[hermes.approval.response]]");
    expect(msg).toContain("decision: denied");
    expect(msg).toContain("reason: too risky");
  });
});
