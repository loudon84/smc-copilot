/**
 * Unified Chat presentation / panel layout state (PRD v1.6.1 §60).
 * Widths persist via localStorage; visibility may also live on ChatRunRecord.presentation.
 */

export type ChatNavigatorKind = "session-files" | "worktree" | null;

export type ChatLayoutState = {
  sessionFilesVisible: boolean;
  worktreeVisible: boolean;
  previewOpen: boolean;
  previewMaximized: boolean;
  promptNavigatorOpen: boolean;
  navigatorWidth: number;
  previewWidth: number;
  worktreeWidth: number;
};

export const CHAT_LAYOUT_DEFAULTS: ChatLayoutState = {
  sessionFilesVisible: false,
  worktreeVisible: false,
  previewOpen: false,
  previewMaximized: false,
  promptNavigatorOpen: false,
  navigatorWidth: 220,
  previewWidth: 440,
  worktreeWidth: 240,
};

export const SESSION_FILES_WIDTH_KEY = "hermes:sessionFilesWidth";
export const WORKTREE_WIDTH_KEY = "hermes:worktreeWidth";
export const PREVIEW_WIDTH_KEY = "hermes:filePreviewWidth";

export function readStoredWidth(
  key: string,
  fallback: number,
  min = 200,
): number {
  try {
    const saved = Number(localStorage.getItem(key));
    if (Number.isFinite(saved) && saved >= min) return saved;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writeStoredWidth(key: string, width: number): void {
  try {
    localStorage.setItem(key, String(Math.round(width)));
  } catch {
    /* ignore */
  }
}

/** Active navigator kind — Session Files and Worktree are mutually exclusive. */
export function resolveNavigatorKind(
  state: Pick<ChatLayoutState, "sessionFilesVisible" | "worktreeVisible">,
): ChatNavigatorKind {
  if (state.sessionFilesVisible) return "session-files";
  if (state.worktreeVisible) return "worktree";
  return null;
}
