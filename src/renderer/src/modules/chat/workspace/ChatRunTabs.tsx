import { Plus, X } from "lucide-react";
import type { ChatRunRegistryEntry } from "./chatRunRegistry";

type Props = {
  runs: ChatRunRegistryEntry[];
  activeRunId: string | null;
  onSelect: (runId: string) => void;
  onClose: (runId: string) => void;
  onNew: () => void;
};

export function ChatRunTabs({
  runs,
  activeRunId,
  onSelect,
  onClose,
  onNew,
}: Props): React.JSX.Element {
  return (
    <div className="chat-run-tabs" role="tablist">
      {runs.map((run) => {
        const active = run.runId === activeRunId;
        return (
          <div
            key={run.runId}
            role="tab"
            aria-selected={active}
            className={`chat-run-tab${active ? " is-active" : ""}${
              run.unread ? " is-unread" : ""
            }${run.loading ? " is-loading" : ""}`}
            onClick={() => {
              onSelect(run.runId);
            }}
          >
            <span className="chat-run-tab-title">{run.title || "Chat"}</span>
            {run.loading && <span className="chat-run-tab-spinner" />}
            {run.unread && !run.loading && (
              <span className="chat-run-tab-dot" aria-label="Unread" />
            )}
            <button
              type="button"
              className="chat-run-tab-close"
              aria-label="Close chat"
              onClick={(e) => {
                e.stopPropagation();
                onClose(run.runId);
              }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
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
  runs: ChatRunRegistryEntry[];
  activeRunId: string | null;
}): React.JSX.Element | null {
  const background = runs.filter(
    (r) => r.runId !== activeRunId && (r.loading || r.unread),
  );
  if (background.length === 0) return null;
  return (
    <div className="chat-background-indicator">
      {background.length} background chat
      {background.length === 1 ? "" : "s"}
    </div>
  );
}
