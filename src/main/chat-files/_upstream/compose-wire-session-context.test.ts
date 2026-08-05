/**
 * Unit tests for ephemeral wire-message composition with session file context.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./file-context-builder", () => ({
  buildSessionFileContext: vi.fn(),
}));

import { buildSessionFileContext } from "./file-context-builder";
import { composeWireMessageWithSessionContext } from "./compose-wire-session-context";

const buildMock = vi.mocked(buildSessionFileContext);

describe("composeWireMessageWithSessionContext", () => {
  afterEach(() => {
    buildMock.mockReset();
  });

  // @lat: [[session-file-context#Wire injection on send]]
  it("returns the original message when sessionId is missing", async () => {
    const out = await composeWireMessageWithSessionContext("hello", {});
    expect(out).toBe("hello");
    expect(buildMock).not.toHaveBeenCalled();
  });

  it("prepends context XML when builder returns text", async () => {
    buildMock.mockResolvedValue({
      text: '<session_file id="f1" name="a.md" type="markdown">\nbody\n</session_file>',
      sources: [],
    });
    const out = await composeWireMessageWithSessionContext("hello", {
      profile: "default",
      sessionId: "sess-1",
    });
    expect(out.startsWith("<session_file")).toBe(true);
    expect(out.endsWith("hello")).toBe(true);
    expect(buildMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess-1",
        query: "hello",
      }),
    );
  });

  it("leaves message unchanged when builder returns empty text", async () => {
    buildMock.mockResolvedValue({ text: "  ", sources: [] });
    const out = await composeWireMessageWithSessionContext("hello", {
      sessionId: "sess-1",
    });
    expect(out).toBe("hello");
  });

  it("falls back to the original message when builder throws", async () => {
    buildMock.mockRejectedValue(new Error("boom"));
    const out = await composeWireMessageWithSessionContext("hello", {
      sessionId: "sess-1",
    });
    expect(out).toBe("hello");
  });
});
