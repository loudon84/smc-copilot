/**
 * Chunk panel state machine for DocumentDetail Hybrid.
 * Server Chunk page is SOT; no optimistic available; no product mock.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  HermesKnowledgeBasesAPI,
  KnowledgeFileChunk,
  KnowledgeFileChunkPage,
  KnowledgeFileParseStatus,
  KnowledgeFileVersionSnapshot,
} from "../../../src/shared/knowledge/knowledge-base-ipc";
import { KnowledgeFacadeError } from "../../../src/shared/knowledge/knowledge-errors";

export type ChunkPanelState =
  | "IDLE"
  | "LOADING"
  | "READY"
  | "EMPTY"
  | "EMPTY_VERSION"
  | "WAITING_PARSE"
  | "PARSE_FAILED"
  | "STALE"
  | "VERIFYING"
  | "ERROR"
  | "READ_ONLY_UNSUPPORTED"
  | "MUTATING_CHUNK";

export type ChunkContentMode = "ellipse" | "full";

const PAGE_SIZES = [10, 25, 50, 100] as const;
export type ChunkPageSize = (typeof PAGE_SIZES)[number];

function errorHttpStatus(error: unknown): number | undefined {
  if (error instanceof KnowledgeFacadeError) return error.httpStatus;
  return undefined;
}

function errorCode(error: unknown): string {
  if (error instanceof KnowledgeFacadeError) return error.code;
  if (error instanceof Error) return error.message.split(/\s/)[0] ?? error.message;
  return "KNOWLEDGE_UNAVAILABLE";
}

function isParsePending(status: KnowledgeFileParseStatus | undefined): boolean {
  return status === "pending" || status === "parsing";
}

function isParseFailed(status: KnowledgeFileParseStatus | undefined): boolean {
  return status === "failed";
}

function activeParseStatus(
  versions: KnowledgeFileVersionSnapshot[],
  activeVersionId: string | null,
): KnowledgeFileParseStatus | undefined {
  if (!activeVersionId) return undefined;
  return versions.find((v) => v.id === activeVersionId)?.parseStatus;
}

export type UseKnowledgeChunkPanelInput = {
  bases: HermesKnowledgeBasesAPI | null;
  sourceFileId: string;
  activeVersionId: string | null;
  versions: KnowledgeFileVersionSnapshot[];
  mutationsEnabled: boolean;
  /** Bumped on reparse / activate to force WAITING_PARSE or refresh. */
  syncEpoch: number;
  reparsePending: boolean;
};

export type UseKnowledgeChunkPanelResult = {
  state: ChunkPanelState;
  page: KnowledgeFileChunkPage | null;
  keywords: string;
  setKeywords: (value: string) => void;
  pageSize: ChunkPageSize;
  setPageSize: (value: ChunkPageSize) => void;
  contentMode: ChunkContentMode;
  setContentMode: (mode: ChunkContentMode) => void;
  errorCode: string;
  notice: string;
  mutatingChunkId: string | null;
  refresh: () => void;
  goPage: (page: number) => void;
  toggleAvailable: (chunk: KnowledgeFileChunk) => void;
  pageSizes: readonly ChunkPageSize[];
};

export function useKnowledgeChunkPanel(
  input: UseKnowledgeChunkPanelInput,
): UseKnowledgeChunkPanelResult {
  const {
    bases,
    sourceFileId,
    activeVersionId,
    versions,
    mutationsEnabled,
    syncEpoch,
    reparsePending,
  } = input;

  const [state, setState] = useState<ChunkPanelState>("IDLE");
  const [page, setPage] = useState<KnowledgeFileChunkPage | null>(null);
  const [keywords, setKeywordsState] = useState("");
  const [debouncedKeywords, setDebouncedKeywords] = useState("");
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize, setPageSizeState] = useState<ChunkPageSize>(50);
  const [contentMode, setContentMode] = useState<ChunkContentMode>("ellipse");
  const [errorCodeState, setErrorCodeState] = useState("");
  const [notice, setNotice] = useState("");
  const [mutatingChunkId, setMutatingChunkId] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const generationRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartedAtRef = useRef<number | null>(null);

  const setKeywords = useCallback((value: string) => {
    setKeywordsState(value);
    setPageIndex(1);
  }, []);

  const setPageSize = useCallback((value: ChunkPageSize) => {
    setPageSizeState(value);
    setPageIndex(1);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedKeywords(keywords.trim().slice(0, 200));
    }, 300);
    return () => clearTimeout(handle);
  }, [keywords]);

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const loadChunks = useCallback(async () => {
    if (!bases || !sourceFileId) {
      setState("IDLE");
      setPage(null);
      return;
    }
    if (!activeVersionId) {
      setState("EMPTY_VERSION");
      setPage(null);
      return;
    }

    const parseStatus = activeParseStatus(versions, activeVersionId);
    if (reparsePending || isParsePending(parseStatus)) {
      setState("WAITING_PARSE");
      setPage(null);
      return;
    }
    if (isParseFailed(parseStatus)) {
      setState("PARSE_FAILED");
      setPage(null);
      return;
    }

    const gen = ++generationRef.current;
    setState((prev) =>
      prev === "VERIFYING" || prev === "STALE" || prev === "MUTATING_CHUNK"
        ? prev
        : "LOADING",
    );
    setErrorCodeState("");
    try {
      const result = await bases.listFileChunks({
        sourceFileId,
        page: pageIndex,
        pageSize,
        keywords: debouncedKeywords || undefined,
      });
      if (gen !== generationRef.current) return;
      if (result.fileVersionId !== activeVersionId) {
        setPage(result);
        setState("STALE");
        return;
      }
      setPage(result);
      setState(result.items.length === 0 ? "EMPTY" : "READY");
      setNotice("");
    } catch (error) {
      if (gen !== generationRef.current) return;
      const status = errorHttpStatus(error);
      setErrorCodeState(errorCode(error));
      setPage(null);
      if (status === 403) {
        setState("ERROR");
        return;
      }
      if (status === 404) {
        setState("ERROR");
        return;
      }
      if (status === 409) {
        setState("STALE");
        return;
      }
      setState("ERROR");
    }
  }, [
    bases,
    sourceFileId,
    activeVersionId,
    versions,
    reparsePending,
    pageIndex,
    pageSize,
    debouncedKeywords,
  ]);

  useEffect(() => {
    void loadChunks();
  }, [loadChunks, syncEpoch, refreshNonce]);

  // Parse polling while WAITING_PARSE
  useEffect(() => {
    clearPoll();
    if (state !== "WAITING_PARSE" || !bases || !sourceFileId) {
      pollStartedAtRef.current = null;
      return;
    }
    if (pollStartedAtRef.current == null) {
      pollStartedAtRef.current = Date.now();
    }
    const tick = (): void => {
      const elapsed = Date.now() - (pollStartedAtRef.current ?? Date.now());
      const delay = elapsed < 20_000 ? 2_000 : 5_000;
      pollTimerRef.current = setTimeout(() => {
        void (async () => {
          try {
            const listed = await bases.listFileVersions({ sourceFileId });
            const status = activeParseStatus(listed, activeVersionId);
            if (isParsePending(status) || reparsePending) {
              tick();
              return;
            }
            pollStartedAtRef.current = null;
            setRefreshNonce((n) => n + 1);
          } catch {
            tick();
          }
        })();
      }, delay);
    };
    tick();
    return () => clearPoll();
  }, [
    state,
    bases,
    sourceFileId,
    activeVersionId,
    reparsePending,
    clearPoll,
  ]);

  const refresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  const goPage = useCallback((next: number) => {
    if (next < 1) return;
    setPageIndex(next);
  }, []);

  const toggleAvailable = useCallback(
    (chunk: KnowledgeFileChunk) => {
      if (
        !bases ||
        !page ||
        !activeVersionId ||
        !mutationsEnabled ||
        state !== "READY" ||
        mutatingChunkId ||
        chunk.available === null
      ) {
        return;
      }
      if (page.fileVersionId !== activeVersionId) {
        setState("STALE");
        return;
      }
      const target = !chunk.available;
      setMutatingChunkId(chunk.id);
      setState("MUTATING_CHUNK");
      void (async () => {
        try {
          const result = await bases.setFileChunkAvailability({
            sourceFileId,
            chunkId: chunk.id,
            fileVersionId: page.fileVersionId,
            available: target,
          });
          setPage((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              items: prev.items.map((item) =>
                item.id === result.chunkId
                  ? { ...item, available: result.available }
                  : item,
              ),
            };
          });
          setState("READY");
          setNotice("");
        } catch (error) {
          const status = errorHttpStatus(error);
          setErrorCodeState(errorCode(error));
          if (status === 409) {
            setState("STALE");
            setRefreshNonce((n) => n + 1);
          } else if (status === 501) {
            setState("READ_ONLY_UNSUPPORTED");
            setNotice("chunkMutationUnsupported");
          } else if (status === 503) {
            setState("VERIFYING");
            setNotice("chunkMutationVerifying");
            try {
              const verified = await bases.listFileChunks({
                sourceFileId,
                page: pageIndex,
                pageSize,
                keywords: debouncedKeywords || undefined,
              });
              setPage(verified);
              if (verified.fileVersionId !== activeVersionId) {
                setState("STALE");
              } else {
                setState(verified.items.length === 0 ? "EMPTY" : "READY");
              }
            } catch {
              setState("ERROR");
            }
          } else if (status === 403) {
            setState("READY");
            setNotice("forbidden");
          } else {
            setState("READY");
          }
        } finally {
          setMutatingChunkId(null);
        }
      })();
    },
    [
      bases,
      page,
      activeVersionId,
      mutationsEnabled,
      state,
      mutatingChunkId,
      sourceFileId,
      pageIndex,
      pageSize,
      debouncedKeywords,
    ],
  );

  return {
    state,
    page,
    keywords,
    setKeywords,
    pageSize,
    setPageSize,
    contentMode,
    setContentMode,
    errorCode: errorCodeState,
    notice,
    mutatingChunkId,
    refresh,
    goPage,
    toggleAvailable,
    pageSizes: PAGE_SIZES,
  };
}
