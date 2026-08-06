import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type {
  SessionCatalogDraftItem,
  SessionCatalogItem,
} from "@shared/session-catalog/session-catalog-contract";
import { useChatWorkspace } from "@renderer/modules/chat/workspace/ChatWorkspaceProvider";
import { useHermesDefault } from "../../context/HermesDefaultContext";
import { DraftRunsSection } from "./DraftRunsSection";
import { SessionCatalogFilters } from "./SessionCatalogFilters";
import { SessionCatalogList } from "./SessionCatalogList";
import { useSessionCatalog } from "./useSessionCatalog";

// @lat: [[domain/chat#Persistent mount and session catalog]]
export default function HermesSessionsPage() {
  const { t } = useTranslation();
  const { setActiveNavItem } = useHermesDefault();
  const { openSession, setActiveRunId } = useChatWorkspace();
  const { filters, setFilters, view, refresh } = useSessionCatalog();

  const navigateToChat = useCallback(() => {
    setActiveNavItem("chat");
  }, [setActiveNavItem]);

  const handleOpen = useCallback(
    async (item: SessionCatalogItem, forceNewTab = false) => {
      await openSession({
        profileId: item.profileId,
        sessionId: item.sessionId,
        title: item.title,
        forceNewTab,
      });
      navigateToChat();
    },
    [navigateToChat, openSession],
  );

  const handleOpenDraft = useCallback(
    (draft: SessionCatalogDraftItem) => {
      setActiveRunId(draft.runId);
      navigateToChat();
    },
    [navigateToChat, setActiveRunId],
  );

  const handleRename = useCallback(
    async (item: SessionCatalogItem, title: string) => {
      if (!title || !window.sessionCatalog) return;
      await window.sessionCatalog.rename({
        profileId: item.profileId,
        sessionId: item.sessionId,
        title,
      });
      await refresh();
    },
    [refresh],
  );

  const handleArchive = useCallback(
    async (item: SessionCatalogItem, archived: boolean) => {
      if (!window.sessionCatalog) return;
      await window.sessionCatalog.archive({
        profileId: item.profileId,
        sessionId: item.sessionId,
        archived,
      });
      await refresh();
    },
    [refresh],
  );

  const handleDelete = useCallback(
    async (item: SessionCatalogItem) => {
      if (!window.sessionCatalog) return;
      await window.sessionCatalog.delete({
        profileId: item.profileId,
        sessionId: item.sessionId,
        soft: true,
      });
      await refresh();
    },
    [refresh],
  );

  const handlePin = useCallback(
    async (item: SessionCatalogItem, pinned: boolean) => {
      if (!window.sessionCatalog) return;
      await window.sessionCatalog.pin({
        profileId: item.profileId,
        sessionId: item.sessionId,
        pinned,
      });
      await refresh();
    },
    [refresh],
  );

  const emptyMessage = (() => {
    if (view.error?.includes("unavailable") || view.profilesUnavailable.length > 0) {
      if (view.items.length === 0) {
        return t("workspaces.hermes.sessions.dbUnavailable");
      }
    }
    if (filters.search.trim()) {
      return t("workspaces.hermes.sessions.emptySearch");
    }
    if (filters.profileId !== "all") {
      return t("workspaces.hermes.sessions.emptyProfile");
    }
    return t("workspaces.hermes.sessions.empty");
  })();

  return (
    <div className="hermes-page hermes-sessions-page" data-testid="hermes-sessions-page">
      <header className="hermes-page__header">
        <h2>{t("workspaces.hermes.sessions.title")}</h2>
        <SessionCatalogFilters
          filters={filters}
          knownProfiles={view.knownProfiles}
          onChange={(patch) => {
            setFilters((f) => ({ ...f, ...patch }));
            void refresh(patch);
          }}
          onRefresh={() => void refresh()}
        />
      </header>
      {view.error ? <p className="hermes-page__error">{view.error}</p> : null}
      {view.loading ? (
        <p className="hermes-page__loading">{t("workspaces.hermes.common.loading")}</p>
      ) : (
        <>
          {filters.showDrafts ? (
            <DraftRunsSection drafts={view.drafts} onOpen={handleOpenDraft} />
          ) : null}
          <SessionCatalogList
            items={view.items}
            emptyMessage={emptyMessage}
            onOpen={handleOpen}
            onRename={handleRename}
            onArchive={handleArchive}
            onDelete={handleDelete}
            onPin={handlePin}
          />
        </>
      )}
    </div>
  );
}
