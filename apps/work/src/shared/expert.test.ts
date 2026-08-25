import { describe, expect, it } from "vitest";
import {
  buildExpertTranscriptAssistantContent,
  canSilentCallExpertSkill,
  decodeExpertIpcError,
  describeSilentCallDenial,
  encodeExpertIpcError,
  formatExpertHealthUserMessage,
  type ExpertCatalogItem,
  type ExpertSkillItem,
} from "./expert";

function readyCatalog(
  overrides: Partial<ExpertCatalogItem> = {},
): ExpertCatalogItem {
  return {
    name: "call-prep",
    slug: "call-prep",
    kind: "expert",
    status: "ready",
    publicSkillCount: 1,
    callableSkillCount: 1,
    ...overrides,
  };
}

function silentSkill(
  overrides: Partial<ExpertSkillItem> = {},
): ExpertSkillItem {
  return {
    name: "customer-profiling",
    status: "ready",
    callEnabled: true,
    riskLevel: "low",
    approvalMode: "auto",
    ...overrides,
  };
}

describe("canSilentCallExpertSkill", () => {
  // @lat: [[expert-execution-tests#Silent-call allowlist]]
  it("allows only ready catalog, ready skill, callEnabled, low, auto", () => {
    expect(canSilentCallExpertSkill(readyCatalog(), silentSkill())).toBe(true);
  });

  it("rejects missing or non-allowlist annotation values", () => {
    expect(
      canSilentCallExpertSkill(
        readyCatalog({ status: "offline" }),
        silentSkill(),
      ),
    ).toBe(false);
    expect(
      canSilentCallExpertSkill(
        readyCatalog({ status: undefined }),
        silentSkill(),
      ),
    ).toBe(false);
    expect(
      canSilentCallExpertSkill(
        readyCatalog(),
        silentSkill({ status: "offline" }),
      ),
    ).toBe(false);
    expect(
      canSilentCallExpertSkill(
        readyCatalog(),
        silentSkill({ callEnabled: false }),
      ),
    ).toBe(false);
    expect(
      canSilentCallExpertSkill(
        readyCatalog(),
        silentSkill({ callEnabled: undefined }),
      ),
    ).toBe(false);
    expect(
      canSilentCallExpertSkill(
        readyCatalog(),
        silentSkill({ riskLevel: "high" }),
      ),
    ).toBe(false);
    expect(
      canSilentCallExpertSkill(
        readyCatalog(),
        silentSkill({ approvalMode: "server" }),
      ),
    ).toBe(false);
  });
});

describe("describeSilentCallDenial", () => {
  it("lists failing fields", () => {
    expect(
      describeSilentCallDenial({
        catalogStatus: "offline",
        skillStatus: "ready",
        callEnabled: true,
        riskLevel: "low",
        approvalMode: "auto",
        canSilentCall: false,
      }),
    ).toContain("expert status is offline");
  });
});

describe("buildExpertTranscriptAssistantContent", () => {
  // @lat: [[expert-execution-tests#Terminal transcript materialize]]
  it("prefers result content then summary for succeeded", () => {
    expect(
      buildExpertTranscriptAssistantContent({
        phase: "succeeded",
        resultContent: "full body",
        resultSummary: "summary",
        errorMessage: null,
        errorCode: null,
      }),
    ).toBe("full body");
    expect(
      buildExpertTranscriptAssistantContent({
        phase: "succeeded",
        resultContent: null,
        resultSummary: "summary only",
        errorMessage: null,
        errorCode: null,
      }),
    ).toBe("summary only");
  });

  it("formats failure and cancel copy", () => {
    expect(
      buildExpertTranscriptAssistantContent({
        phase: "failed",
        resultContent: null,
        resultSummary: null,
        errorMessage: "boom",
        errorCode: "X",
      }),
    ).toBe("Expert failed: boom");
    expect(
      buildExpertTranscriptAssistantContent({
        phase: "cancelled",
        resultContent: null,
        resultSummary: null,
        errorMessage: null,
        errorCode: null,
      }),
    ).toBe("Expert run cancelled.");
  });
});

describe("encodeExpertIpcError", () => {
  it("round-trips through Error.message and Electron invoke wrapper", () => {
    const encoded = encodeExpertIpcError({
      message: "服务器内部错误",
      status: 500,
      errorCode: "errors.system.internal_error",
    });
    const wrapped = new Error(
      `Error invoking remote method 'expert:get-health': ${encoded.message}`,
    );
    const decoded = decodeExpertIpcError(wrapped);
    expect(decoded).toMatchObject({
      message: "服务器内部错误",
      status: 500,
      errorCode: "errors.system.internal_error",
    });
    expect(formatExpertHealthUserMessage("unavailable", decoded, wrapped)).toBe(
      "Expert Gateway unavailable.",
    );
  });

  it("maps INVALID_HEALTH_PAYLOAD to a clear error message", () => {
    const encoded = encodeExpertIpcError({
      message: "bad",
      status: 200,
      errorCode: "INVALID_HEALTH_PAYLOAD",
    });
    const decoded = decodeExpertIpcError(encoded);
    expect(formatExpertHealthUserMessage("error", decoded, encoded)).toBe(
      "Expert Gateway returned an invalid health payload.",
    );
  });
});
