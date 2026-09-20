import { useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/tailwind";
import type {
  KnowledgeFileChunk,
  KnowledgeFileChunkImageResult,
} from "../../../src/shared/knowledge/knowledge-base-ipc";
import { ChunkImage } from "./ChunkImage";
import { ChunkRichContentRenderer } from "./ChunkRichContentRenderer";
import type { UseKnowledgeChunkPanelResult } from "./useKnowledgeChunkPanel";

type Translate = (key: string) => string;

type KnowledgeChunkPanelProps = {
  t: Translate;
  panel: UseKnowledgeChunkPanelResult;
  mutationsEnabled: boolean;
};

export function KnowledgeChunkPanel({
  t,
  panel,
  mutationsEnabled,
}: KnowledgeChunkPanelProps): ReactElement {
  const {
    state,
    page,
    keywords,
    setKeywords,
    pageSize,
    setPageSize,
    contentMode,
    setContentMode,
    errorCode,
    notice,
    mutatingChunkId,
    refresh,
    goPage,
    toggleAvailable,
    getChunkImage,
    pageSizes,
  } = panel;

  const totalPages = page
    ? Math.max(1, Math.ceil(page.total / page.pageSize))
    : 1;

  const reloadToken = page
    ? `${page.sourceFileId}:${page.fileVersionId}:${page.page}:${page.pageSize}:${page.total}`
    : "none";

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background"
      data-testid="knowledge-chunk-panel"
      data-state={state}
    >
      <div
        className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-2 py-2"
        data-testid="knowledge-chunk-header"
      >
        <span className="text-sm font-medium">{t("knowledge.chunk.result")}</span>
        {page ? (
          <span
            className="text-xs text-muted-foreground"
            data-testid="knowledge-chunk-total"
          >
            {t("knowledge.chunk.total")}: {page.total}
          </span>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="knowledge-chunk-refresh"
          onClick={() => refresh()}
        >
          {t("knowledge.host.refresh")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={contentMode === "ellipse" ? "secondary" : "outline"}
          data-testid="knowledge-chunk-ellipse"
          onClick={() => setContentMode("ellipse")}
        >
          {t("knowledge.chunk.ellipse")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={contentMode === "full" ? "secondary" : "outline"}
          data-testid="knowledge-chunk-full"
          onClick={() => setContentMode("full")}
        >
          {t("knowledge.chunk.fullText")}
        </Button>
      </div>

      <div
        className="sticky top-0 z-[9] flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-2 py-2"
        data-testid="knowledge-chunk-search-toolbar"
      >
        <Input
          data-testid="knowledge-chunk-search"
          className="min-w-[10rem] flex-1"
          value={keywords}
          placeholder={t("knowledge.chunk.searchChunks")}
          onChange={(e) => setKeywords(e.target.value)}
        />
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          {t("knowledge.chunk.pageSize")}
          <select
            data-testid="knowledge-chunk-page-size"
            className="rounded border border-border bg-background px-1 py-0.5"
            value={pageSize}
            onChange={(e) =>
              setPageSize(Number(e.target.value) as typeof pageSize)
            }
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      {notice ? (
        <p
          className="shrink-0 px-2 pt-2 text-xs text-amber-700"
          data-testid="knowledge-chunk-notice"
        >
          {notice === "chunkMutationUnsupported"
            ? t("knowledge.chunk.mutationUnsupported")
            : notice === "chunkMutationVerifying"
              ? t("knowledge.chunk.mutationVerifying")
              : notice === "forbidden"
                ? t("knowledge.chunk.forbidden")
                : notice}
        </p>
      ) : null}

      <div
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2"
        data-testid="knowledge-chunk-list-host"
      >
        {state === "LOADING" ||
        state === "MUTATING_CHUNK" ||
        state === "VERIFYING" ? (
          <p data-testid="knowledge-chunk-loading">{t("knowledge.loading")}</p>
        ) : null}
        {state === "WAITING_PARSE" ? (
          <p data-testid="knowledge-chunk-waiting-parse">
            {t("knowledge.chunk.waitingParse")}
          </p>
        ) : null}
        {state === "PARSE_FAILED" ? (
          <p data-testid="knowledge-chunk-parse-failed">
            {t("knowledge.chunk.parseFailed")}
          </p>
        ) : null}
        {state === "EMPTY_VERSION" ? (
          <p data-testid="knowledge-chunk-empty-version">
            {t("knowledge.chunk.emptyVersion")}
          </p>
        ) : null}
        {state === "EMPTY" ? (
          <p data-testid="knowledge-chunk-empty">{t("knowledge.chunk.noChunks")}</p>
        ) : null}
        {state === "STALE" ? (
          <div
            className="flex flex-col gap-2"
            data-testid="knowledge-chunk-stale"
          >
            <p>{t("knowledge.chunk.versionStale")}</p>
            <Button type="button" size="sm" onClick={() => refresh()}>
              {t("knowledge.host.refresh")}
            </Button>
          </div>
        ) : null}
        {state === "READ_ONLY_UNSUPPORTED" ? (
          <p data-testid="knowledge-chunk-readonly">
            {t("knowledge.chunk.mutationUnsupported")}
          </p>
        ) : null}
        {state === "ERROR" ? (
          <div
            className="flex flex-col gap-2"
            data-testid="knowledge-chunk-error"
          >
            <p>
              {t("knowledge.host.errorTitle")}: {errorCode}
            </p>
            <Button type="button" size="sm" onClick={() => refresh()}>
              {t("knowledge.host.retry")}
            </Button>
          </div>
        ) : null}

        {(state === "READY" ||
          state === "MUTATING_CHUNK" ||
          state === "STALE") &&
        page &&
        page.items.length > 0 ? (
          <ul className="space-y-2" data-testid="knowledge-chunk-list">
            {page.items.map((chunk) => (
              <ChunkItem
                key={chunk.id}
                t={t}
                chunk={chunk}
                mode={contentMode}
                mutationsEnabled={mutationsEnabled}
                busy={mutatingChunkId === chunk.id}
                toggleDisabled={
                  !mutationsEnabled ||
                  state !== "READY" ||
                  chunk.available === null ||
                  Boolean(mutatingChunkId)
                }
                onToggle={() => toggleAvailable(chunk)}
                loadImage={getChunkImage}
                reloadToken={reloadToken}
              />
            ))}
          </ul>
        ) : null}
      </div>

      {page && (state === "READY" || state === "EMPTY") ? (
        <div
          className="sticky bottom-0 z-10 flex shrink-0 items-center gap-2 border-t border-border bg-background px-2 py-2"
          data-testid="knowledge-chunk-pagination"
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="knowledge-chunk-prev"
            disabled={page.page <= 1}
            onClick={() => goPage(page.page - 1)}
          >
            {t("knowledge.chunk.prev")}
          </Button>
          <span data-testid="knowledge-chunk-page">
            {t("knowledge.chunk.page")} {page.page} / {totalPages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="knowledge-chunk-next"
            disabled={page.page >= totalPages}
            onClick={() => goPage(page.page + 1)}
          >
            {t("knowledge.chunk.next")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ChunkItem({
  t,
  chunk,
  mode,
  mutationsEnabled,
  busy,
  toggleDisabled,
  onToggle,
  loadImage,
  reloadToken,
}: {
  t: Translate;
  chunk: KnowledgeFileChunk;
  mode: "ellipse" | "full";
  mutationsEnabled: boolean;
  busy: boolean;
  toggleDisabled: boolean;
  onToggle: () => void;
  loadImage: (chunkId: string) => Promise<KnowledgeFileChunkImageResult>;
  reloadToken: string;
}): ReactElement {
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const availableLabel =
    chunk.available === null
      ? t("knowledge.chunk.availabilityUnknown")
      : chunk.available
        ? t("knowledge.chunk.availableOn")
        : t("knowledge.chunk.availableOff");

  return (
    <li
      className={cn(
        "rounded-md border border-border p-2 text-sm",
        busy && "opacity-70",
      )}
      data-testid={`knowledge-chunk-item-${chunk.id}`}
      data-available={
        chunk.available === null ? "unknown" : chunk.available ? "true" : "false"
      }
      data-has-image={chunk.hasImage ? "true" : "false"}
    >
      <div
        className={cn(
          "flex gap-3",
          // Hybrid card: thumbnail | content (row). Stack only when pane is very narrow.
          chunk.hasImage ? "flex-row items-start" : "flex-col",
        )}
        data-testid={`knowledge-chunk-body-${chunk.id}`}
      >
        <ChunkImage
          t={t}
          chunkId={chunk.id}
          hasImage={chunk.hasImage}
          loadImage={loadImage}
          reloadToken={reloadToken}
        />
        <div className="min-w-0 flex-1">
          <ChunkRichContentRenderer
            content={chunk.content}
            mode={mode}
            testId={`knowledge-chunk-rich-${chunk.id}`}
          />
        </div>
      </div>
      {chunk.importantKeywords.length > 0 ? (
        <p
          className="mt-2 text-[10px] text-muted-foreground"
          data-testid={`knowledge-chunk-keywords-${chunk.id}`}
        >
          {t("knowledge.chunk.keywords")}: {chunk.importantKeywords.join(", ")}
        </p>
      ) : null}
      {chunk.questions.length > 0 ? (
        <div className="mt-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-1 text-[10px]"
            data-testid={`knowledge-chunk-questions-toggle-${chunk.id}`}
            onClick={() => setQuestionsOpen((v) => !v)}
          >
            {questionsOpen
              ? t("knowledge.chunk.hideQuestions")
              : t("knowledge.chunk.showQuestions")}
          </Button>
          {questionsOpen ? (
            <ul
              className="mt-1 list-disc pl-4 text-[10px] text-muted-foreground"
              data-testid={`knowledge-chunk-questions-${chunk.id}`}
            >
              {chunk.questions.map((q, i) => (
                <li key={`${chunk.id}-q-${i}`}>{q}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span data-testid={`knowledge-chunk-available-${chunk.id}`}>
          {availableLabel}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid={`knowledge-chunk-toggle-${chunk.id}`}
          disabled={toggleDisabled || !mutationsEnabled}
          onClick={onToggle}
        >
          {t("knowledge.chunk.toggleAvailable")}
        </Button>
      </div>
    </li>
  );
}
