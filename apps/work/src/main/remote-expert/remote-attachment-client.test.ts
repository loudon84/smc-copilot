import { describe, expect, it } from "vitest";
import {
  assertPromptBlocksSafe,
  buildPromptBlocks,
} from "./remote-attachment-client";

describe("attachment resource denial", () => {
  it("[A-NEG-ATTACH-001] rejects file://, absolute paths, and http ResourceLinks", () => {
    for (const uri of [
      "file:///C:/secret.txt",
      "file:///etc/passwd",
      "https://untrusted.example/x",
      "C:\\secret.txt",
      "/etc/passwd",
    ]) {
      expect(() =>
        assertPromptBlocksSafe([{ type: "resource_link", uri, name: "x" }]),
      ).toMatchObject({});
      try {
        assertPromptBlocksSafe([{ type: "resource_link", uri, name: "x" }]);
        throw new Error("expected throw");
      } catch (err) {
        expect((err as { code: string }).code).toBe(
          "REMOTE_EXPERT_RESOURCE_DENIED",
        );
      }
    }
  });

  it("[A-ATTACH-001] allows nodeskclaw attachment links", () => {
    const blocks = buildPromptBlocks("hi", [
      {
        type: "resource_link",
        uri: "nodeskclaw://attachment/att_abc",
        name: "a.txt",
      },
    ]);
    expect(blocks.some((b) => b.type === "text")).toBe(true);
  });
});
