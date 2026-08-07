/**
 * Owns File Preview Panel state at the Chat screen level (not inside a
 * single file card) so only one preview is ever open at a time.
 */

import { useCallback, useRef, useState } from "react";
import type {
  FilePreviewDescriptor,
  FilePreviewOptions,
  MessageDocumentPreviewInput,
} from "@shared/chat-files";

export interface FilePreviewState {
  open: boolean;
  fileId?: string;
  loading: boolean;
  descriptor?: FilePreviewDescriptor;
  error?: string;
  loadingMore?: boolean;
  /** In-memory message document (preview without creating a file). */
  messageDocument?: MessageDocumentPreviewInput;
}

export interface UseFilePreviewResult {
  state: FilePreviewState;
  openPreview: (fileId: string, profile?: string) => Promise<void>;
  openMessagePreview: (source: MessageDocumentPreviewInput) => void;
  closePreview: () => void;
  retry: () => void;
  loadMore: () => Promise<void>;
}

const INITIAL_STATE: FilePreviewState = { open: false, loading: false };

// @lat: [[file-platform#File preview]]
export function useFilePreview(): UseFilePreviewResult {
  const [state, setState] = useState<FilePreviewState>(INITIAL_STATE);
  // Guards against a slower, earlier request overwriting a newer one when
  // the user quickly switches between files.
  const requestIdRef = useRef(0);
  const lastArgsRef = useRef<{ fileId: string; profile?: string } | null>(null);

  const load = useCallback(
    async (
      fileId: string,
      profile?: string,
      options?: FilePreviewOptions,
      append = false,
    ) => {
      const requestId = ++requestIdRef.current;
      lastArgsRef.current = { fileId, profile };
      if (append) {
        setState((prev) => ({
          ...prev,
          messageDocument: undefined,
          loadingMore: true,
        }));
      } else {
        setState({
          open: true,
          fileId,
          loading: true,
          messageDocument: undefined,
        });
      }
      try {
        const result = await window.chatFiles.platform.getPreview(
          profile,
          fileId,
          options,
        );
        if (requestIdRef.current !== requestId) return;
        if (result && "error" in result) {
          setState({
            open: true,
            fileId,
            loading: false,
            loadingMore: false,
            error: result.error.message,
          });
          return;
        }
        setState((prev) => {
          if (append && prev.descriptor && result.content != null) {
            return {
              open: true,
              fileId,
              loading: false,
              loadingMore: false,
              descriptor: {
                ...result,
                content: `${prev.descriptor.content ?? ""}${result.content}`,
                offset: prev.descriptor.offset ?? 0,
              },
            };
          }
          return {
            open: true,
            fileId,
            loading: false,
            loadingMore: false,
            descriptor: result,
          };
        });
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        setState({
          open: true,
          fileId,
          loading: false,
          loadingMore: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [],
  );

  const openPreview = useCallback(
    (fileId: string, profile?: string) => load(fileId, profile),
    [load],
  );

  const openMessagePreview = useCallback(
    (source: MessageDocumentPreviewInput) => {
      requestIdRef.current += 1;
      lastArgsRef.current = null;
      setState({
        open: true,
        loading: false,
        messageDocument: source,
        descriptor: {
          fileId: "",
          type: "markdown",
          title: source.title,
          content: source.content,
          mime: "text/markdown",
          canOpenExternal: false,
          canSaveAs: true,
          canCopyText: true,
          canAddToContext: false,
          canRetryParse: false,
        },
      });
    },
    [],
  );

  const closePreview = useCallback(() => {
    requestIdRef.current += 1;
    lastArgsRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const retry = useCallback(() => {
    const args = lastArgsRef.current;
    if (!args) return;
    void load(args.fileId, args.profile);
  }, [load]);

  const loadMore = useCallback(async () => {
    const args = lastArgsRef.current;
    const next = state.descriptor?.nextOffset;
    if (!args || next == null) return;
    await load(args.fileId, args.profile, { offset: next }, true);
  }, [load, state.descriptor?.nextOffset]);

  return {
    state,
    openPreview,
    openMessagePreview,
    closePreview,
    retry,
    loadMore,
  };
}
