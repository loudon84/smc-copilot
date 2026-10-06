import { describe, expect, it } from "vitest";
import {
  emitRemoteExpertLog,
  logsContainSecrets,
  redactRemoteExpertText,
  resetRemoteExpertLogs,
} from "./remote-expert-log";

describe("remote expert log redaction", () => {
  it("[A-OBS-001] [A-SEC-001] redacts bearer tokens", () => {
    resetRemoteExpertLogs();
    const text = redactRemoteExpertText("Authorization: Bearer abc.def.ghi");
    expect(text).not.toMatch(/Bearer abc/);
    expect(logsContainSecrets("Authorization: Bearer secret-token-value")).toBe(
      true,
    );
    emitRemoteExpertLog({
      operation_id: "op",
      trace_id: "tr",
      stage: "PROMPT",
      status: "FAIL",
      error_code: "REMOTE_EXPERT_PROMPT_FAILED",
    });
  });
});
