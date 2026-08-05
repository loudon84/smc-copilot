import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatFilesPort, ChatFileRef } from "../../ports/ChatFilesPort";

type Props = {
  files: ChatFilesPort;
  sessionId: string | null;
  profileId: string;
  onPreview?: (file: ChatFileRef) => void;
  onClose?: () => void;
};

function groupOf(f: ChatFileRef): "attachments" | "context" | "agent_output" {
  if (f.category === "context") return "context";
  if (f.category === "agent_output") return "agent_output";
  return "attachments";
}

/**
 * Production Session Files panel — grouped list + search + context actions.
 */
export function SessionFilesPanel({
  files,
  sessionId,
  profileId,
  onPreview,
  onClose,
}: Props): React.JSX.Element | null {
  const [items, setItems] = useState<ChatFileRef[]>([]);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const refresh = useCallback(async () => {
    if (!sessionId || !files.listSessionFiles) {
      setItems([]);
      return;
    }
    try {
      if (debounced && files.searchSessionFiles) {
        const list = await files.searchSessionFiles(
          sessionId,
          debounced,
          profileId,
        );
        setItems(list);
      } else {
        const list = await files.listSessionFiles(sessionId, profileId);
        setItems(list);
      }
    } catch {
      setItems([]);
    }
  }, [debounced, files, profileId, sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const groups = useMemo(() => {
    const attachments: ChatFileRef[] = [];
    const context: ChatFileRef[] = [];
    const agent_output: ChatFileRef[] = [];
    for (const f of items) {
      const g = groupOf(f);
      if (g === "context") context.push(f);
      else if (g === "agent_output") agent_output.push(f);
      else attachments.push(f);
    }
    return { attachments, context, agent_output };
  }, [items]);

  if (!sessionId) return null;

  const renderGroup = (title: string, list: ChatFileRef[]) => (
    <section className="session-files-group">
      <h4>{title}</h4>
      {list.length === 0 ? (
        <div className="session-files-panel__empty">Empty</div>
      ) : (
        <ul className="session-files-panel__list">
          {list.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => onPreview?.(f)}>
                {f.name}
              </button>
              <div className="session-files-panel__actions">
                {files.addToContext && groupOf(f) !== "context" && (
                  <button
                    type="button"
                    onClick={() =>
                      void files
                        .addToContext?.(sessionId, f.id, profileId)
                        .then(refresh)
                    }
                  >
                    +Ctx
                  </button>
                )}
                {files.removeFromContext && groupOf(f) === "context" && (
                  <button
                    type="button"
                    onClick={() =>
                      void files
                        .removeFromContext?.(sessionId, f.id, profileId)
                        .then(refresh)
                    }
                  >
                    −Ctx
                  </button>
                )}
                {f.path && (
                  <button
                    type="button"
                    onClick={() => void files.reveal?.(f.path!)}
                  >
                    Reveal
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="session-files-panel">
      <div className="session-files-panel-header">
        <div className="session-files-panel-title">Session files</div>
        {onClose && (
          <button
            type="button"
            className="session-files-panel-toggle"
            onClick={onClose}
            aria-label="Hide session files"
          >
            ×
          </button>
        )}
      </div>
      <input
        className="session-files-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search files…"
      />
      {renderGroup("Attachments", groups.attachments)}
      {renderGroup("Context", groups.context)}
      {renderGroup("Agent Output", groups.agent_output)}
    </div>
  );
}
