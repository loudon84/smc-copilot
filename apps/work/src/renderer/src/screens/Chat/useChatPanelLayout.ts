import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export const SESSION_FILES_VISIBLE_KEY = "hermes:chat:session-files-visible";
export const PROMPT_NAVIGATOR_OPEN_KEY = "hermes:chat:prompt-navigator-open";

/** Persisted Session Files sidebar visibility (default shown). */
export function useSessionFilesVisible(): [
  boolean,
  Dispatch<SetStateAction<boolean>>,
] {
  const [sessionFilesVisible, setSessionFilesVisible] = useState<boolean>(
    () => localStorage.getItem(SESSION_FILES_VISIBLE_KEY) !== "false",
  );

  useEffect(() => {
    localStorage.setItem(
      SESSION_FILES_VISIBLE_KEY,
      String(sessionFilesVisible),
    );
  }, [sessionFilesVisible]);

  return [sessionFilesVisible, setSessionFilesVisible];
}

/** Persisted Prompt Navigator open/closed preference (default open). */
export function usePromptNavigatorOpen(): [
  boolean,
  Dispatch<SetStateAction<boolean>>,
] {
  const [promptNavigatorOpen, setPromptNavigatorOpen] = useState<boolean>(
    () => localStorage.getItem(PROMPT_NAVIGATOR_OPEN_KEY) !== "false",
  );

  useEffect(() => {
    localStorage.setItem(
      PROMPT_NAVIGATOR_OPEN_KEY,
      String(promptNavigatorOpen),
    );
  }, [promptNavigatorOpen]);

  return [promptNavigatorOpen, setPromptNavigatorOpen];
}

/**
 * Ephemeral File Preview maximize over chat-body.
 * Esc restores only when this Chat instance is active.
 */
export function useFilePreviewMaximized(
  previewOpen: boolean,
  active: boolean,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [filePreviewMaximized, setFilePreviewMaximized] = useState(false);

  useEffect(() => {
    if (!previewOpen) {
      setFilePreviewMaximized(false);
    }
  }, [previewOpen]);

  useEffect(() => {
    if (!active || !filePreviewMaximized) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setFilePreviewMaximized(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, filePreviewMaximized]);

  return [filePreviewMaximized, setFilePreviewMaximized];
}
