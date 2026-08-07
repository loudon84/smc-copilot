/**
 * Chat v8.0.2 acceptance checklist (manual / future Electron E2E).
 *
 * NOT an automated E2E suite — scenarios must be executed against a running
 * desktop build. Unit/integration coverage lives in adjacent Vitest files.
 *
 * PRD v8.0.2 §10 / §11:
 * 1. Default Chat — Markdown / code / Diff / copy
 * 2. Composer — IME Enter, Slash, Voice, Queue, Model groups
 * 3. Tool activity — collapsible grouped by callId
 * 4. Prompt Hint bound to composer input affects submit
 * 5. Session files panel + preview (no empty 320px aside)
 * 6. Three concurrent ChatRuns isolated (MultiRunChatShell)
 * 7. Abort only affects current run
 * 8. Expert / Skill / Permission not duplicated (toolbar only)
 * 9. Prompt Navigator jump (≥2 user prompts)
 * 10. VITE_CHAT_ENGINE legacy|copilot switch
 */

import { describe, expect, it } from "vitest";

/** Living catalog of acceptance scenarios (not executable E2E). */
export const CHAT_V802_ACCEPTANCE_CATALOG = [
  "default-chat-markdown",
  "composer-ime-slash-queue",
  "tools-grouped-by-callid",
  "prompt-hint-bound-submit",
  "session-files-preview-panels",
  "three-concurrent-runs",
  "abort-one-run",
  "work-toolbar-no-duplicate",
  "prompt-navigator",
  "engine-switch",
] as const;

describe("chat v8.0.2 acceptance catalog", () => {
  it("lists all required acceptance scenarios (checklist only)", () => {
    expect(CHAT_V802_ACCEPTANCE_CATALOG).toHaveLength(10);
  });
});
