import { useCallback, useEffect, useState, type ReactElement } from "react";
import type { KnowledgeSetSnapshot } from "../../../../../shared/knowledge/knowledge-set-ipc";

export type KnowledgeConnectorProps = {
  selectedSetId: string | null;
  locked: boolean;
  disabled?: boolean;
  onSelect: (setId: string) => void;
};

/**
 * Toolbar KnowledgeSet picker — selection only; never calls Retrieval.
 * "New knowledge chat" lives on the Knowledge page aside only (not prompt toolbar).
 */
export function KnowledgeConnector({
  selectedSetId,
  locked,
  disabled = false,
  onSelect,
}: KnowledgeConnectorProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [sets, setSets] = useState<KnowledgeSetSnapshot[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    const api = window.hermesAPI?.knowledgeJobs?.sets;
    if (!api?.list) {
      setLoadError("KNOWLEDGE_UNAVAILABLE");
      setSets([]);
      return;
    }
    try {
      const page = await api.list({ page: 1, pageSize: 100 });
      setSets(page.items ?? []);
      setLoadError(null);
    } catch {
      setLoadError("KNOWLEDGE_UNAVAILABLE");
      setSets([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const id = selectedSetId?.trim();
    if (!id) {
      setSelectedName(null);
      return;
    }
    const fromList = sets.find((s) => s.id === id);
    if (fromList) {
      setSelectedName(fromList.name);
      return;
    }
    const api = window.hermesAPI?.knowledgeJobs?.sets;
    if (!api?.get) return;
    let cancelled = false;
    void Promise.resolve(api.get({ knowledgeSetId: id }))
      .then((snap) => {
        if (!cancelled) setSelectedName(snap.name);
      })
      .catch(() => {
        if (!cancelled) setSelectedName(id);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSetId, sets]);

  const activeSets = sets.filter((s) => s.status === "active");
  const label = selectedSetId
    ? `Knowledge: ${selectedName ?? selectedSetId}${locked ? " [locked]" : ""}`
    : "Knowledge: Select";

  return (
    <div className="knowledge-connector" style={{ position: "relative" }}>
      <button
        type="button"
        className="btn-ghost chat-tool-btn"
        disabled={disabled}
        onClick={() => {
          if (locked) return;
          setOpen((v) => !v);
          void reload();
        }}
        title={loadError ?? label}
      >
        {label}
        {!locked ? " ▼" : ""}
      </button>
      {open && !locked ? (
        <div
          role="listbox"
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            zIndex: 20,
            minWidth: 220,
            maxHeight: 240,
            overflow: "auto",
            background: "var(--bg-elevated, #1e1e1e)",
            border: "1px solid var(--border, #333)",
            borderRadius: 8,
            padding: 4,
          }}
        >
          {activeSets.length === 0 ? (
            <div style={{ padding: 8, fontSize: 12, opacity: 0.8 }}>
              {loadError
                ? "Knowledge provider unavailable"
                : "No active knowledge sets"}
            </div>
          ) : (
            activeSets.map((s) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={s.id === selectedSetId}
                className="btn-ghost"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  fontSize: 12,
                }}
                onClick={() => {
                  onSelect(s.id);
                  setOpen(false);
                }}
              >
                {s.name}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
