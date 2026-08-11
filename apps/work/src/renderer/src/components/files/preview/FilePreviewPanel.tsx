import { useState } from "react";
import { BookmarkPlus, RotateCw, Download, FilePlus2 } from "lucide-react";
import type { MessageDocumentPreviewInput } from "../../../../../shared/files";
import type { FilePreviewState } from "../../../hooks/files/useFilePreview";
import { FilePreviewHeader } from "./FilePreviewHeader";
import { FilePreviewError } from "./FilePreviewError";
import { FilePreviewRouter } from "./FilePreviewRouter";
import { MessageDocumentPreview } from "./MessageDocumentPreview";

interface FilePreviewPanelProps {
  state: FilePreviewState;
  profile?: string;
  /** When set, "Add to context" calls files.addToSessionContext. */
  sessionId?: string;
  maximized?: boolean;
  onToggleMaximized?: () => void;
  onClose: () => void;
  onRetry: () => void;
  onLoadMore?: () => void;
  /** After creating a file from a message document, open managed preview. */
  onMessageFileCreated?: (fileId: string) => void;
}

const MIN_PANEL_WIDTH = 320;
const WIDTH_STORAGE_KEY = "hermes:filePreviewWidth";
const maxPanelWidth = (): number =>
  Math.max(MIN_PANEL_WIDTH, window.innerWidth - 360);

/** Right-side panel that previews a managed file or an in-memory message document. */
// @lat: [[file-platform#File preview]]
export function FilePreviewPanel({
  state,
  profile,
  sessionId,
  maximized = false,
  onToggleMaximized,
  onClose,
  onRetry,
  onLoadMore,
  onMessageFileCreated,
}: FilePreviewPanelProps): React.JSX.Element {
  const [width, setWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem(WIDTH_STORAGE_KEY));
    return Number.isFinite(saved) && saved >= MIN_PANEL_WIDTH ? saved : 440;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [contextBusy, setContextBusy] = useState(false);
  const [parseBusy, setParseBusy] = useState(false);
  const [docBusy, setDocBusy] = useState(false);

  const startResize = (e: React.PointerEvent): void => {
    if (maximized) return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    let nextWidth = startWidth;
    setIsResizing(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const onMove = (ev: PointerEvent): void => {
      const delta = startX - ev.clientX;
      nextWidth = Math.min(
        maxPanelWidth(),
        Math.max(MIN_PANEL_WIDTH, startWidth + delta),
      );
      setWidth(nextWidth);
    };
    const onUp = (): void => {
      setIsResizing(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      localStorage.setItem(WIDTH_STORAGE_KEY, String(Math.round(nextWidth)));
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  const fileId = state.fileId;
  const isMessageDoc = !!state.messageDocument;

  const handleOpenExternal = (): void => {
    if (!fileId) return;
    void window.hermesAPI.files.openExternal(profile, fileId);
  };
  const handleReveal = (): void => {
    if (!fileId) return;
    void window.hermesAPI.files.revealInFolder(profile, fileId);
  };
  const handleSaveAs = (): void => {
    if (!fileId) return;
    void window.hermesAPI.files.saveAs(profile, fileId);
  };

  const createFromMessageDoc = async (
    source: MessageDocumentPreviewInput,
    thenSaveAs: boolean,
  ): Promise<void> => {
    if (docBusy) return;
    const effectiveSessionId = source.sessionId || sessionId;
    if (!effectiveSessionId) return;
    setDocBusy(true);
    try {
      const result = await window.hermesAPI.files.createFromMessage({
        profile,
        sessionId: effectiveSessionId,
        messageId: source.messageId,
        title: source.title,
        content: source.content,
        extension: "md",
      });
      onMessageFileCreated?.(result.file.id);
      if (thenSaveAs) {
        await window.hermesAPI.files.saveAs(profile, result.file.id);
      }
    } catch {
      /* surfaced via toast elsewhere if needed */
    } finally {
      setDocBusy(false);
    }
  };

  const canCreateFromMessage =
    !!(state.messageDocument?.sessionId || sessionId);
  const canAddToContext =
    !!sessionId && !!fileId && (state.descriptor?.canAddToContext ?? false);
  const canRetryParse = !!fileId && (state.descriptor?.canRetryParse ?? false);

  const handleAddToContext = (): void => {
    if (!canAddToContext || !sessionId || !fileId) return;
    setContextBusy(true);
    void window.hermesAPI.files
      .addToSessionContext({ profile, sessionId, fileId })
      .catch(() => undefined)
      .finally(() => setContextBusy(false));
  };

  const handleRetryParse = (): void => {
    if (!canRetryParse || !fileId) return;
    setParseBusy(true);
    void window.hermesAPI.files
      .retryParse(profile, fileId)
      .then(() => onRetry())
      .catch(() => undefined)
      .finally(() => setParseBusy(false));
  };

  return (
    <div
      className={[
        "file-preview-panel",
        maximized ? "file-preview-panel-maximized" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={maximized ? undefined : { width }}
    >
      {!maximized && (
        <div
          className={`file-preview-resize-handle ${
            isResizing ? "file-preview-resize-handle-active" : ""
          }`}
          onPointerDown={startResize}
          title="Drag to resize"
        />
      )}
      <FilePreviewHeader
        descriptor={state.descriptor}
        fallbackTitle={state.messageDocument?.title}
        messageMode={isMessageDoc}
        maximized={maximized}
        onToggleMaximized={onToggleMaximized}
        onOpenExternal={handleOpenExternal}
        onReveal={handleReveal}
        onSaveAs={
          isMessageDoc && state.messageDocument
            ? () => void createFromMessageDoc(state.messageDocument!, true)
            : handleSaveAs
        }
        onClose={onClose}
        saveAsDisabled={
          isMessageDoc ? docBusy || !canCreateFromMessage : undefined
        }
      />
      <div className="file-preview-body">
        {state.error ? (
          <FilePreviewError message={state.error} onRetry={onRetry} />
        ) : isMessageDoc && state.messageDocument ? (
          <MessageDocumentPreview
            title={state.messageDocument.title}
            markdown={state.messageDocument.content}
          />
        ) : (
          <FilePreviewRouter state={state} onLoadMore={onLoadMore} />
        )}
      </div>
      {isMessageDoc && state.messageDocument ? (
        <div className="file-preview-footer">
          <button
            type="button"
            className="file-preview-footer-btn"
            disabled={docBusy || !canCreateFromMessage}
            title={
              canCreateFromMessage
                ? "Save as Markdown"
                : "Start a session before saving this report"
            }
            onClick={() =>
              void createFromMessageDoc(state.messageDocument!, true)
            }
          >
            <Download size={13} />
            Save as .md
          </button>
          <button
            type="button"
            className="file-preview-footer-btn"
            disabled={docBusy || !canCreateFromMessage}
            title={
              canCreateFromMessage
                ? "Add to session files"
                : "Start a session before adding to Agent Output"
            }
            onClick={() =>
              void createFromMessageDoc(state.messageDocument!, false)
            }
          >
            <FilePlus2 size={13} />
            Add to session files
          </button>
        </div>
      ) : (
        <div className="file-preview-footer">
          <button
            type="button"
            className="file-preview-footer-btn"
            disabled={!canAddToContext || contextBusy}
            title={
              sessionId
                ? "Add to session context"
                : "Open a session to add this file to context"
            }
            onClick={handleAddToContext}
          >
            <BookmarkPlus size={13} />
            Add to context
          </button>
          <button
            type="button"
            className="file-preview-footer-btn"
            disabled={!canRetryParse || parseBusy}
            title="Retry parse"
            onClick={handleRetryParse}
          >
            <RotateCw size={13} />
            Retry parse
          </button>
        </div>
      )}
    </div>
  );
}
