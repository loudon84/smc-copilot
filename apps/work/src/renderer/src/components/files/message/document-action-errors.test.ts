import { describe, expect, it } from "vitest";
import {
  formatDocumentActionError,
  isIpcHandlerMissingError,
} from "./document-action-errors";

describe("document-action-errors", () => {
  it("detects missing IPC handler errors", () => {
    expect(
      isIpcHandlerMissingError(
        new Error("No handler registered for 'files:create-from-message'"),
      ),
    ).toBe(true);
    expect(isIpcHandlerMissingError(new Error("other"))).toBe(false);
  });

  it("formats missing-handler copy", () => {
    expect(
      formatDocumentActionError(
        new Error("No handler registered for 'files:create-from-message'"),
      ),
    ).toBe("文件服务未初始化");
  });
});
