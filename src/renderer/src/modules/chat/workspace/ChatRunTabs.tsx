import { useCallback, useMemo, useState } from "react";
import { Plus, X, ChevronDown } from "lucide-react";
import type { ChatRunRecord } from "./ChatRunRecord";
import { isRunBusy } from "./ChatRunRecord";

const MAX_VISIBLE_TABS = 8;

type Props = {
  runs: ChatRunRecord[];
  activeRunId: string | null;
  onSelect: (runId: string) => void;
  onClose: (runId: string) => void;
  onNew: () => void;
  onRename?: (runId: string, title: string) => void;
};

function tabLoading(run: ChatRunRecord): boolean {
  return isRunBusy(run.execution.runState);
}

export function ChatRunTabs({
  runs,
  activeRunId,
  onSelect,
  onClose,
  onNew,
  onRename,
}: Props): React.JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [overflowOpen, setOverflowOpen] = useState(false);

  const visible = useMemo(() => runs.slice(0, MAX_VISIBLE_TABS), [runs]);
  const overflow = useMemo(() => runs.slice(MAX_VISIBLE_TABS), [runs]);

  const requestClose = useCallback(
    (run: ChatRunRecord) => {
      if (tabLoading(run)) {
        const ok = window.confirm(
          `"${run.presentation.title}" is still running. Close it anyway?`,
        );
        if (!ok) return;
      }
      onClose(run.runId);
    },
    [onClose],
  );

  const startRename = useCallback((run: ChatRunRecord) => {
    setEditingId(run.runId);
    setEditValue(run.presentation.title);
  }, []);

  const commitRename = useCallback(() => {
    if (editingId && onRename) {
      onRename(editingId, editValue.trim() || "New Chat");
    }
    setEditingId(null);
  }, [editValue, editingId, onRename]);

  const renderTab = (run: ChatRunRecord) => {
    const active = run.runId === activeRunId;
    const loading = tabLoading(run);
    const skill = run.context.skillDisplayName || run.context.skillName;
    const tooltip = [
      run.presentation.title,
      run.context.expertName ? `Expert: ${run.context.expertName}` : null,
      skill ? `Skill: ${skill}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <div
        key={run.runId}
        role="tab"
        aria-selected={active}
        title={tooltip}
        className={`chat-run-tab${active ? " is-active" : ""}${
          run.presentation.unread ? " is-unread" : ""
        }${loading ? " is-loading" : ""}`}
        onClick={() => onSelect(run.runId)}
        onDoubleClick={(e) => {
          e.preventDefault();
          startRename(run);
        }}
        onMouseDown={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            requestClose(run);
          }
        }}
      >
        {editingId === run.runId ? (
          <input
            className="chat-run-tab-rename"
            value={editValue}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditingId(null);
            }}
          />
        ) : (
          <span className="chat-run-tab-title">
            {run.presentation.title || "New Chat"}
          </span>
        )}
        {skill ? (
          <span className="chat-run-tab-skill-badge" title={skill}>
            {skill}
          </span>
        ) : null}
        {loading && <span className="chat-run-tab-spinner" />}
        {run.presentation.unread && !loading && (
          <span className="chat-run-tab-dot" aria-label="Unread" />
        )}
        <button
          type="button"
          className="chat-run-tab-close"
          aria-label="Close chat"
          onClick={(e) => {
            e.stopPropagation();
            requestClose(run);
          }}
        >
          <X size={12} />
        </button>
      </div>
    );
  };

  return (
    <div className="chat-run-tabs" role="tablist">
      {visible.map(renderTab)}
      {overflow.length > 0 ? (
        <div className="chat-run-tabs-overflow">
          <button
            type="button"
            className="chat-run-tab-overflow-btn"
            aria-expanded={overflowOpen}
            onClick={() => setOverflowOpen((v) => !v)}
          >
            +{overflow.length}
            <ChevronDown size={12} />
          </button>
          {overflowOpen ? (
            <div className="chat-run-tabs-overflow-menu" role="menu">
              {overflow.map((run) => (
                <button
                  key={run.runId}
                  type="button"
                  role="menuitem"
                  className={
                    run.runId === activeRunId ? "is-active" : undefined
                  }
                  onClick={() => {
                    onSelect(run.runId);
                    setOverflowOpen(false);
                  }}
                >
                  {run.presentation.title || "New Chat"}
                  {run.presentation.unread ? " ·" : ""}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        className="chat-run-tab-new"
        onClick={onNew}
        title="New chat"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

/** Keeps a run host mounted; visibility controlled via CSS. */
export function ChatRunHost({
  runId,
  active,
  children,
}: {
  runId: string;
  active: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className="chat-run-host"
      data-run-id={runId}
      hidden={!active}
      aria-hidden={!active}
      style={{ display: active ? "flex" : "none", flex: 1, minHeight: 0 }}
    >
      {children}
    </div>
  );
}

export function BackgroundRunIndicator({
  runs,
  activeRunId,
}: {
  runs: ChatRunRecord[];
  activeRunId: string | null;
}): React.JSX.Element | null {
  const background = runs.filter(
    (r) =>
      r.runId !== activeRunId &&
      (isRunBusy(r.execution.runState) || r.presentation.unread),
  );
  if (background.length === 0) return null;
  return (
    <div className="chat-background-indicator">
      {background.length} background chat
      {background.length === 1 ? "" : "s"}
    </div>
  );
}
