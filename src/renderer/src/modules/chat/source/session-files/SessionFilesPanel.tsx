/**
 * Compact sidebar: session attachments / context / agent output + FTS search.
 */

import { useCallback, useEffect, useState } from "react";
import { PanelRightClose } from "lucide-react";
import type {
  FileSearchResult,
  ManagedFileView,
} from "@shared/chat-files";
import { useSessionFiles } from "./useSessionFiles";
import { SessionFileRow } from "./SessionFileRow";
import { AgentOutputSection } from "./AgentOutputSection";
import { searchSessionManagedFiles } from "./session-file-actions";

export interface SessionFilesPanelProps {
  profile?: string;
  sessionId: string;
  /** Bump to force a re-fetch (e.g. after createFromMessage). */
  refreshKey?: number;
  onPreview?: (fileId: string) => void;
  /** When set, shows a header control that hides the panel. */
  onHide?: () => void;
}

const SEARCH_DEBOUNCE_MS = 250;

function Section({
  title,
  files,
  emptyLabel,
  contextFileIds,
  onPreview,
  onAddContext,
  onRemoveContext,
}: {
  title: string;
  files: ManagedFileView[];
  emptyLabel: string;
  contextFileIds: Set<string>;
  onPreview?: (fileId: string) => void;
  onAddContext: (fileId: string) => void;
  onRemoveContext: (fileId: string) => void;
}): React.JSX.Element {
  return (
    <div className="session-files-section">
      <div className="session-files-section-title">{title}</div>
      {files.length === 0 ? (
        <div className="session-files-empty">{emptyLabel}</div>
      ) : (
        <div className="session-files-list">
          {files.map((file) => (
            <SessionFileRow
              key={`${file.id}-${file.associationRole ?? "none"}-${file.ordinal ?? 0}`}
              file={file}
              inContext={contextFileIds.has(file.id)}
              onPreview={onPreview}
              onAddContext={
                contextFileIds.has(file.id) ? undefined : onAddContext
              }
              onRemoveContext={
                contextFileIds.has(file.id) ? onRemoveContext : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchResults({
  results,
  searching,
  onPreview,
}: {
  results: FileSearchResult[];
  searching: boolean;
  onPreview?: (fileId: string) => void;
}): React.JSX.Element {
  return (
    <div className="session-files-section">
      <div className="session-files-section-title">Search results</div>
      {searching && <div className="session-files-empty">Searching…</div>}
      {!searching && results.length === 0 && (
        <div className="session-files-empty">No matches</div>
      )}
      {!searching && results.length > 0 && (
        <div className="session-files-list session-files-search-list">
          {results.map((hit) => (
            <button
              key={`${hit.fileId}-${hit.chunkIndex}-${hit.score}`}
              type="button"
              className="session-files-search-hit"
              onClick={() => onPreview?.(hit.fileId)}
              title={hit.fileName}
            >
              <span className="session-files-search-hit-name">
                {hit.fileName}
              </span>
              <span className="session-files-search-hit-snippet">
                {hit.snippet}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact sidebar listing session attachments, context files, and agent outputs. */
// @lat: [[session-file-context#Session Files Panel]]
export function SessionFilesPanel({
  profile,
  sessionId,
  refreshKey = 0,
  onPreview,
  onHide,
}: SessionFilesPanelProps): React.JSX.Element {
  const { groups, loading, error, addToContext, removeFromContext, refresh } =
    useSessionFiles(profile, sessionId);
  const contextFileIds = new Set(groups.contextFiles.map((f) => f.id));

  useEffect(() => {
    if (refreshKey > 0) {
      void refresh();
    }
  }, [refreshKey, refresh]);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FileSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const runSearch = useCallback(async () => {
    if (!debouncedQuery) {
      setSearchResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const hits = await searchSessionManagedFiles({
        profile,
        sessionId,
        query: debouncedQuery,
      });
      setSearchResults(hits || []);
    } catch (err) {
      setSearchResults([]);
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  }, [debouncedQuery, profile, sessionId]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  const showSearch = debouncedQuery.length > 0;

  return (
    <div className="session-files-panel">
      <div className="session-files-panel-header">
        <div className="session-files-panel-title">Session files</div>
        {onHide && (
          <button
            type="button"
            className="session-files-panel-toggle"
            onClick={onHide}
            title="Hide session files"
            aria-label="Hide session files"
          >
            <PanelRightClose size={15} />
          </button>
        )}
      </div>
      <input
        type="search"
        className="session-files-search-input"
        placeholder="Search session files…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search session files"
      />
      {searchError && <div className="session-files-error">{searchError}</div>}
      {showSearch ? (
        <SearchResults
          results={searchResults}
          searching={searching}
          onPreview={onPreview}
        />
      ) : (
        <>
          {loading && <div className="session-files-empty">Loading…</div>}
          {error && <div className="session-files-error">{error}</div>}
          {!loading && !error && (
            <>
              <Section
                title="Attachments"
                files={groups.attachments}
                emptyLabel="No attachments"
                contextFileIds={contextFileIds}
                onPreview={onPreview}
                onAddContext={addToContext}
                onRemoveContext={removeFromContext}
              />
              <Section
                title="Context"
                files={groups.contextFiles}
                emptyLabel="No context files"
                contextFileIds={contextFileIds}
                onPreview={onPreview}
                onAddContext={addToContext}
                onRemoveContext={removeFromContext}
              />
              <AgentOutputSection
                files={groups.agentOutput}
                profile={profile}
                onPreview={onPreview}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default SessionFilesPanel;
