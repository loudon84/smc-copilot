import { useEffect, useState } from "react";
import type { ChatFilesPort, ChatFileRef } from "../../ports/ChatFilesPort";

type Props = {
  files: ChatFilesPort;
  sessionId: string | null;
  profileId: string;
  onPreview?: (file: ChatFileRef) => void;
};

/**
 * Lite SessionFilesPanel — lists persisted session files via ChatFilesPort.
 */
export function SessionFilesPanel({
  files,
  sessionId,
  profileId,
  onPreview,
}: Props): React.JSX.Element | null {
  const [items, setItems] = useState<ChatFileRef[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!sessionId || !files.listSessionFiles) {
        setItems([]);
        return;
      }
      try {
        const list = await files.listSessionFiles(sessionId, profileId);
        if (!cancelled) setItems(list);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [files, sessionId, profileId]);

  if (!sessionId) return null;

  return (
    <div className="session-files-panel">
      <div className="session-files-panel__title">Session files</div>
      {items.length === 0 ? (
        <div className="session-files-panel__empty">No files</div>
      ) : (
        <ul className="session-files-panel__list">
          {items.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => onPreview?.(f)}>
                {f.name}
              </button>
              {f.path ? (
                <button
                  type="button"
                  className="session-files-panel__reveal"
                  onClick={() => void files.reveal?.(f.path!)}
                >
                  Reveal
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
