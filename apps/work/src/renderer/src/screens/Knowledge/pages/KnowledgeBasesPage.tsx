import { useEffect, useMemo, useState, type ReactElement } from "react";
import { LayoutGrid, List } from "lucide-react";
import { useI18n } from "../../../components/useI18n";
import {
  useKnowledgeFacade,
  type UseKnowledgeFacadeOptions,
} from "../../../../../shared/knowledge/use-knowledge-facade";
import type {
  HermesKnowledgeBasesAPI,
  KnowledgeBaseSnapshot,
  KnowledgeBaseVisibility,
} from "../../../../../shared/knowledge/knowledge-base-ipc";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeModeSnapshot,
} from "../../../../../shared/knowledge/knowledge-job-ipc";
import type { KnowledgeRouteParams } from "../knowledge-route-descriptor";
import {
  KnowledgeEmptyState,
  KnowledgeEntityModal,
  KnowledgeLoading,
  KnowledgeSearchInput,
  KnowledgeToolbar,
} from "../knowledge-page-chrome";
import {
  KnowledgeBaseCardGrid,
  KnowledgeBaseTable,
} from "../features/bases/list/KnowledgeBaseList";
import { KnowledgeBaseCreateForm } from "../features/bases/create/KnowledgeBaseCreateForm";

export type KnowledgeBasesPageProps = {
  params?: KnowledgeRouteParams;
  onNavigate?: (target: {
    page: string;
    params?: KnowledgeRouteParams;
  }) => void;
  onBack?: () => void;
  capability?: KnowledgeCapabilitySnapshot | null;
  mode?: KnowledgeModeSnapshot | null;
  facade?: HermesKnowledgeFacadeAPI | null;
  bases?: HermesKnowledgeBasesAPI | null;
};

type BasesLoadState = "loading" | "unavailable" | "empty" | "content" | "error";

function errorCode(error: unknown): string {
  if (error instanceof Error) return error.message.split(/\s/)[0] ?? error.message;
  return "KNOWLEDGE_UNAVAILABLE";
}

/**
 * Knowledge Bases list only. Detail is KnowledgeBaseDetailPage.
 */
export function KnowledgeBasesPage({
  onNavigate,
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
  bases: injectedBases,
}: KnowledgeBasesPageProps): ReactElement {
  const { t } = useI18n();
  const probe = useKnowledgeFacade({
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
    bases: injectedBases,
  } satisfies UseKnowledgeFacadeOptions);
  const [loadState, setLoadState] = useState<BasesLoadState>("loading");
  const [items, setItems] = useState<KnowledgeBaseSnapshot[]>([]);
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [view, setView] = useState<"card" | "table">("card");
  const [errorMessage, setErrorMessage] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftVisibility, setDraftVisibility] =
    useState<KnowledgeBaseVisibility>("organization");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refreshList = async (): Promise<void> => {
    if (!probe.bases) {
      setItems([]);
      setLoadState(
        probe.presentation === "unavailable" ? "unavailable" : "empty",
      );
      return;
    }
    const page = await probe.bases.list({ page: 1, pageSize: 50 });
    setItems(page.items);
    setLoadState(page.items.length > 0 ? "content" : "empty");
  };

  useEffect(() => {
    if (probe.presentation === "loading") {
      setLoadState("loading");
      return;
    }
    if (probe.presentation === "unavailable") {
      setLoadState("unavailable");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await refreshList();
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(errorCode(error));
        setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh tied to probe
  }, [probe.presentation, probe.bases]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (visibility !== "all" && item.visibility !== visibility) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q);
    });
  }, [items, search, visibility]);

  const mutationsEnabled = probe.mutationsEnabled;

  const handleCreate = async (): Promise<void> => {
    if (!mutationsEnabled || !probe.bases || submitting) return;
    setSubmitting(true);
    try {
      await probe.bases.create({
        name: draftName.trim(),
        description: draftDescription.trim() ? draftDescription.trim() : null,
        visibility: draftVisibility,
      });
      setDraftName("");
      setDraftDescription("");
      setDraftVisibility("organization");
      setDialogOpen(false);
      await refreshList();
    } catch (error) {
      setErrorMessage(errorCode(error));
      setLoadState("error");
    } finally {
      setSubmitting(false);
    }
  };

  const openItem = (id: string): void => {
    onNavigate?.({ page: "bases", params: { knowledgeBaseId: id } });
  };

  return (
    <div data-testid="knowledge-bases-page" data-state={loadState}>
      {loadState === "loading" ? (
        <KnowledgeLoading label={t("knowledge.loading")} />
      ) : null}
      {loadState === "unavailable" ? (
        <KnowledgeEmptyState
          title={t("knowledge.unavailableTitle")}
          description={
            probe.capability?.status === "auth_required"
              ? t("knowledge.host.authRequired")
              : t("knowledge.unavailableDescription")
          }
        />
      ) : null}
      {loadState === "error" ? (
        <KnowledgeEmptyState
          title={t("knowledge.host.errorTitle")}
          description={errorMessage}
        />
      ) : null}

      {loadState === "empty" || loadState === "content" ? (
        <>
          <KnowledgeToolbar>
            <KnowledgeSearchInput
              testId="knowledge-bases-search"
              placeholder={t("knowledge.host.searchPlaceholder")}
              value={search}
              onChange={setSearch}
            />
            <label>
              {t("knowledge.host.visibility")}
              <select
                data-testid="knowledge-bases-visibility"
                value={visibility}
                onChange={(event) => setVisibility(event.target.value)}
              >
                <option value="all">{t("knowledge.host.filterAll")}</option>
                <option value="private">{t("knowledge.host.private")}</option>
                <option value="department">{t("knowledge.host.department")}</option>
                <option value="organization">{t("knowledge.host.organization")}</option>
              </select>
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid="knowledge-bases-view-card"
              aria-pressed={view === "card"}
              onClick={() => setView("card")}
            >
              <LayoutGrid size={14} /> {t("knowledge.host.viewCard")}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid="knowledge-bases-view-table"
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
            >
              <List size={14} /> {t("knowledge.host.viewTable")}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid="knowledge-base-create"
              disabled={!mutationsEnabled}
              title={
                mutationsEnabled ? undefined : t("knowledge.bases.mutateDisabled")
              }
              onClick={() => setDialogOpen(true)}
            >
              {t("knowledge.bases.createLabel")}
            </button>
          </KnowledgeToolbar>
          {!mutationsEnabled ? <p>{t("knowledge.bases.mutateDisabled")}</p> : null}
          {filtered.length === 0 ? (
            <p data-testid="knowledge-base-list-empty">
              {t("knowledge.bases.emptyList")}
            </p>
          ) : view === "card" ? (
            <KnowledgeBaseCardGrid items={filtered} onOpen={openItem} />
          ) : (
            <KnowledgeBaseTable
              items={filtered}
              onOpen={openItem}
              openLabel={t("knowledge.host.open")}
              nameLabel={t("knowledge.bases.listTitle")}
              visibilityLabel={t("knowledge.host.visibility")}
            />
          )}

          <KnowledgeEntityModal
            open={dialogOpen}
            onOpenChange={(open) => {
              if (submitting && !open) return;
              setDialogOpen(open);
            }}
            submitting={submitting}
            title={t("knowledge.bases.createLabel")}
          >
            <KnowledgeBaseCreateForm
              name={draftName}
              description={draftDescription}
              visibility={draftVisibility}
              disabled={!mutationsEnabled}
              submitting={submitting}
              onNameChange={setDraftName}
              onDescriptionChange={setDraftDescription}
              onVisibilityChange={setDraftVisibility}
              onCancel={() => {
                if (!submitting) setDialogOpen(false);
              }}
              onSubmit={() => {
                void handleCreate();
              }}
              nameLabel={t("knowledge.host.namePlaceholder")}
              descriptionLabel={t("knowledge.bases.descriptionLabel")}
              visibilityLabel={t("knowledge.host.visibility")}
              cancelLabel={t("knowledge.host.cancel")}
              createLabel={t("knowledge.host.create")}
              privateLabel={t("knowledge.host.private")}
              departmentLabel={t("knowledge.host.department")}
              organizationLabel={t("knowledge.host.organization")}
            />
          </KnowledgeEntityModal>
        </>
      ) : null}
    </div>
  );
}

export default KnowledgeBasesPage;
