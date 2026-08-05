/**
 * Electron E2E acceptance checklist for Chat v8.0.1 (manual / future Spectron).
 * Keep as living doc — automated smoke covered by unit tests.
 *
 * Scenarios (PRD §12.4):
 * 1. Default Chat two-turn same sessionId
 * 2. Expert Chat completes with artifact
 * 3. Team Chat triggers dispatch
 * 4. Three concurrent ChatRuns isolated
 * 5. Abort one run only
 * 6. Upload + preview text file
 * 7. Agent markdown Save As
 * 8. Restart restores session files index
 * 9. Local / remote / ssh modes
 * 10. VITE_CHAT_ENGINE legacy|copilot switch
 */

import { describe, expect, it } from "vitest";

const MATRIX = [
  "default-chat-two-turns",
  "expert-artifact",
  "team-dispatch",
  "three-concurrent-runs",
  "abort-one-run",
  "upload-preview",
  "markdown-save-as",
  "restart-file-index",
  "connection-modes",
  "engine-switch",
] as const;

describe("chat v8.0.1 e2e matrix catalog", () => {
  it("lists all required acceptance scenarios", () => {
    expect(MATRIX).toHaveLength(10);
  });
});
