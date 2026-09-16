import { describe, expect, it } from "vitest";
import {
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
