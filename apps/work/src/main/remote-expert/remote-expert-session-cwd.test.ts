import { describe, expect, it } from "vitest";
import { mkdtempSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ensureRemoteExpertSessionCwd } from "./remote-expert-session-cwd";

describe("ensureRemoteExpertSessionCwd", () => {
  it("creates an absolute per-desktop session directory", () => {
    const root = mkdtempSync(join(tmpdir(), "re-cwd-"));
    const desktopId = "4e49e825-69db-4995-8b61-f4dda0d9f6ed";
    const cwd = ensureRemoteExpertSessionCwd(desktopId, root);
    expect(cwd.startsWith(root)).toBe(true);
    expect(existsSync(cwd)).toBe(true);
    expect(cwd).toContain("remote-expert-acp");
    expect(cwd).toContain("sessions");
    // Same desktop id → stable path
    expect(ensureRemoteExpertSessionCwd(desktopId, root)).toBe(cwd);
  });
});
