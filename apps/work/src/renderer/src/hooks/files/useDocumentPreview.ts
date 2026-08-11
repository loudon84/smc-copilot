/**
 * In-memory Assistant Message document preview (no ManagedFile / fileId yet).
 */

import { useCallback, useState } from "react";
import type { MessageDocumentPreviewInput } from "../../../../shared/files";

export interface DocumentPreviewState {
  open: boolean;
  sessionId?: string;
  messageId?: string;
  title?: string;
  content?: string;
}

export interface UseDocumentPreviewResult {
  state: DocumentPreviewState;
  open: (input: MessageDocumentPreviewInput) => void;
  close: () => void;
}

const INITIAL: DocumentPreviewState = { open: false };

/** Owns message-document preview state separately from managed-file preview. */
// @lat: [[file-ui-components#Message document preview]]
export function useDocumentPreview(): UseDocumentPreviewResult {
  const [state, setState] = useState<DocumentPreviewState>(INITIAL);

  const open = useCallback((input: MessageDocumentPreviewInput) => {
    setState({
      open: true,
      sessionId: input.sessionId,
      messageId: input.messageId,
      title: input.title,
      content: input.content,
    });
  }, []);

  const close = useCallback(() => {
    setState(INITIAL);
  }, []);

  return { state, open, close };
}
