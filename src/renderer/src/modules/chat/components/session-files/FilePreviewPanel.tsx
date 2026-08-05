import { useEffect, useRef, useState } from "react";
import type { ChatFilesPort, ChatFileRef } from "../../ports/ChatFilesPort";

type Props = {
  files: ChatFilesPort;
  file: ChatFileRef | null;
  profileId: string;
  onClose: () => void;
  maximized?: boolean;
  onToggleMaximize?: () => void;
};

function isImage(name: string, mime?: string): boolean {
  if (mime?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name);
}

function isMarkdown(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

function isCode(name: string): boolean {
  return /\.(ts|tsx|js|jsx|py|json|ya?ml|toml|css|html|sh|rs|go|java|c|cpp|h)$/i.test(
    name,
  );
}

/**
 * Production File Preview — auto-loads content; supports text/md/code/image;
 * actions: reveal / save / open external / maximize.
 */
export function FilePreviewPanel({
  files,
  file,
  profileId,
  onClose,
  maximized,
  onToggleMaximize,
}: Props): React.JSX.Element | null {
  const [content, setContent] = useState<string>("");
  const [url, setUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const widthRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent("");
    setUrl(undefined);
    void (async () => {
      try {
        const res = await files.preview?.(file.id, profileId);
        if (cancelled) return;
        if (res && "error" in res && res.error) {
          setError(String(res.error));
        } else {
          setContent(res?.content || "");
          setUrl(res?.url);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, files, profileId]);

  if (!file) return null;

  const image = isImage(file.name, file.mimeType);

  return (
    <div
      ref={widthRef}
      className={`file-preview-panel${maximized ? " file-preview-panel--max" : ""}`}
    >
      <div className="file-preview-panel__header">
        <strong title={file.name}>{file.name}</strong>
        <div className="file-preview-panel__header-actions">
          {onToggleMaximize && (
            <button type="button" onClick={onToggleMaximize}>
              {maximized ? "Restore" : "Maximize"}
            </button>
          )}
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="file-preview-panel__actions">
        {file.path && (
          <>
            <button type="button" onClick={() => void files.reveal?.(file.path!)}>
              Reveal
            </button>
            <button
              type="button"
              onClick={() => void files.openExternal?.(file.path!)}
            >
              Open
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => void files.saveManagedFileAs?.(file.id, file.name)}
        >
          Save as
        </button>
        {files.addToContext && (
          <button
            type="button"
            onClick={() =>
              void files.addToContext?.(
                "session",
                file.id,
                profileId,
              )
            }
          >
            Add to Context
          </button>
        )}
      </div>
      {loading && <div className="file-preview-panel__loading">Loading…</div>}
      {error && <div className="file-preview-panel__error">{error}</div>}
      {!loading && !error && image && (url || content.startsWith("data:")) && (
        <img
          className="file-preview-panel__image"
          src={url || content}
          alt={file.name}
        />
      )}
      {!loading && !error && !image && (
        <pre
          className={`file-preview-panel__content${
            isMarkdown(file.name) || isCode(file.name)
              ? " file-preview-panel__content--code"
              : ""
          }`}
        >
          {content || "(empty)"}
        </pre>
      )}
    </div>
  );
}
