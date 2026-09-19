import { describe, expect, it } from "vitest";
import {
  isKnowledgeChunkIpcResult,
  KNOWLEDGE_BASE_IPC_CHANNELS,
  knowledgeBaseActionAllowed,
  type KnowledgeBaseStatus,
} from "./knowledge-base-ipc";

describe("knowledge base status matrix", () => {
  const rows: Array<[KnowledgeBaseStatus, boolean, boolean, boolean]> = [
    ["provisioning", false, false, false],
    ["active", true, true, true],
    ["updating", false, false, false],
    ["degraded", true, true, true],
    ["error", true, false, true],
    ["deleting", false, false, false],
  ];

  it.each(rows)("%s save/upload/delete", (status, save, upload, del) => {
    expect(knowledgeBaseActionAllowed(status, "save")).toBe(save);
    expect(knowledgeBaseActionAllowed(status, "upload")).toBe(upload);
    expect(knowledgeBaseActionAllowed(status, "delete")).toBe(del);
  });
});

describe("chunk IPC contract smoke", () => {
  it("exposes list/set chunk channels", () => {
    expect(KNOWLEDGE_BASE_IPC_CHANNELS.listFileChunks).toBe(
      "knowledge-base:list-file-chunks",
    );
    expect(KNOWLEDGE_BASE_IPC_CHANNELS.setFileChunkAvailability).toBe(
      "knowledge-base:set-file-chunk-availability",
    );
  });

  it("recognizes structured chunk IPC envelopes", () => {
    expect(isKnowledgeChunkIpcResult({ ok: true, data: { total: 0 } })).toBe(
      true,
    );
    expect(
      isKnowledgeChunkIpcResult({
        ok: false,
        error: {
          code: "KNOWLEDGE_FORBIDDEN",
          retryable: false,
          operationId: "kb-1",
          httpStatus: 403,
        },
      }),
    ).toBe(true);
    expect(isKnowledgeChunkIpcResult({ ok: false })).toBe(false);
  });
});
