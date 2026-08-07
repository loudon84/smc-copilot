import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SessionCatalogItem } from "@shared/session-catalog/session-catalog-contract";

type Props = {
  items: SessionCatalogItem[];
  emptyMessage: string;
  onOpen: (item: SessionCatalogItem, forceNewTab?: boolean) => void;
  onRename: (item: SessionCatalogItem, title: string) => void;
  onArchive: (item: SessionCatalogItem, archived: boolean) => void;
  onDelete: (item: SessionCatalogItem) => void;
  onPin: (item: SessionCatalogItem, pinned: boolean) => void;
};

export function SessionCatalogList({
  items,
  emptyMessage,
  onOpen,
  onRename,
  onArchive,
  onDelete,
  onPin,
}: Props) {
  const { t } = useTranslation();
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  if (items.length === 0) {
    return (
      <p className="hermes-page__empty" data-testid="session-catalog-empty">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="hermes-session-list" data-testid="session-catalog-list">
      {items.map((s) => {
        const key = `${s.profileId}::${s.sessionId}`;
        return (
          <li key={key} className="hermes-session-list__item">
            {renamingId === key ? (
              <div className="hermes-session-list__rename">
                <input
                  className="hermes-input"
                  value={renameDraft}
                  autoFocus
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void onRename(s, renameDraft.trim());
                      setRenamingId(null);
                    }
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  onBlur={() => {
                    if (renameDraft.trim()) void onRename(s, renameDraft.trim());
                    setRenamingId(null);
                  }}
                />
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="hermes-session-list__open"
                  onClick={() => onOpen(s, false)}
                  data-testid={`session-catalog-open-${s.sessionId}`}
                >
                  <strong>
                    {s.pinned ? "📌 " : ""}
                    {s.title || s.sessionId}
                  </strong>
                  <span>
                    {s.profileId} · {s.messageCount}{" "}
                    {t("workspaces.hermes.sessions.msgs")} · {s.status} ·{" "}
                    {new Date(
                      (s.startedAt > 1e12 ? s.startedAt : s.startedAt * 1000),
                    ).toLocaleString()}
                  </span>
                </button>
                <div className="hermes-session-list__menu-wrap">
                  <button
                    type="button"
                    className="hermes-btn-ghost"
                    onClick={() => setMenuId(menuId === key ? null : key)}
                    aria-label="Session actions"
                  >
                    ⋯
                  </button>
                  {menuId === key ? (
                    <div className="hermes-session-list__menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => { onOpen(s, false); setMenuId(null); }}>
                        {t("workspaces.hermes.sessions.open")}
                      </button>
                      <button type="button" role="menuitem" onClick={() => { onOpen(s, true); setMenuId(null); }}>
                        {t("workspaces.hermes.sessions.openNewTab")}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setRenamingId(key);
                          setRenameDraft(s.title || s.sessionId);
                          setMenuId(null);
                        }}
                      >
                        {t("workspaces.hermes.sessions.rename")}
                      </button>
                      <button type="button" role="menuitem" onClick={() => { onPin(s, !s.pinned); setMenuId(null); }}>
                        {s.pinned
                          ? t("workspaces.hermes.sessions.unpin")
                          : t("workspaces.hermes.sessions.pin")}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onArchive(s, !s.archived);
                          setMenuId(null);
                        }}
                      >
                        {s.archived
                          ? t("workspaces.hermes.sessions.unarchive")
                          : t("workspaces.hermes.sessions.archive")}
                      </button>
                      <button type="button" role="menuitem" onClick={() => { onDelete(s); setMenuId(null); }}>
                        {t("workspaces.hermes.sessions.delete")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
