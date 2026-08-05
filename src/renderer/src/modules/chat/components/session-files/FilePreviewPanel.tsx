import { useState } from "react";
import type { ChatFilesPort, ChatFileRef } from "../../ports/ChatFilesPort";

type Props = {
  files: ChatFilesPort;
  file: ChatFileRef | null;
  profileId: string;
  onClose: () => void;
};

export function FilePreviewPanel({
  files,
  file,
  profileId,
  onClose,
}: Props): React.JSX.Element | null {
  const [content, setContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  if (!file) return null;

  return (
    <div className="file-preview-panel">
      <div className="file-preview-panel__header">
        <strong>{file.name}</strong>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="file-preview-panel__actions">
        <button
          type="button"
          onClick={() => {
            void (async () => {
              try {
                const res = await files.preview?.(file.id, profileId);
                setContent(res?.content || "");
                setError(res && "error" in (res as object) ? String((res as { error?: string }).error || "") : null);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            })();
          }}
        >
          Load preview
        </button>
        <button
          type="button"
          onClick={() => void files.saveManagedFileAs?.(file.id, file.name)}
        >
          Save as
        </button>
      </div>
      {error && <div className="file-preview-panel__error">{error}</div>}
      {content && (
        <pre className="file-preview-panel__content">{content.slice(0, 8000)}</pre>
      )}
    </div>
  );
}
