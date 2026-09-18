import { useEffect, useMemo, useState, type ReactElement } from "react";
import { BusinessModuleUISurface } from "@/components/common/business-module-ui-surface";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PageToolbar } from "@/components/common/page-toolbar";
import { SearchInput } from "@/components/common/search-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "../../../components/useI18n";
import {
  useKnowledgeFacade,
  type UseKnowledgeFacadeOptions,
} from "../../../../../shared/knowledge/use-knowledge-facade";
import type {
  HermesKnowledgeBasesAPI,
  KnowledgeBaseSnapshot,
  KnowledgeBaseStatus,
  KnowledgeBaseVisibility,
} from "../../../../../shared/knowledge/knowledge-base-ipc";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeModeSnapshot,
} from "../../../../../shared/knowledge/knowledge-job-ipc";
import type { KnowledgeRouteParams } from "../knowledge-route-descriptor";
import { KnowledgeLoading } from "../knowledge-page-chrome";
import { KnowledgeBaseCardGrid } from "../features/bases/list/KnowledgeBaseList";
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
  const statusLabel = (status: KnowledgeBaseStatus): string =>
    t(`knowledge.bases.status.${status}`);
  const visibilityLabel = (value: KnowledgeBaseVisibility): string => {
    if (value === "private") return t("knowledge.host.private");
    if (value === "department") return t("knowledge.host.department");
    return t("knowledge.host.organization");
  };

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
    <BusinessModuleUISurface module="knowledge">
      <div data-testid="knowledge-bases-page" data-state={loadState}>
        {loadState === "loading" ? (
          <KnowledgeLoading label={t("knowledge.loading")} />
        ) : null}
        {loadState === "unavailable" ? (
          <EmptyState
            title={t("knowledge.unavailableTitle")}
            description={
              probe.capability?.status === "auth_required"
                ? t("knowledge.host.authRequired")
                : t("knowledge.unavailableDescription")
            }
          />
        ) : null}
        {loadState === "error" ? (
          <EmptyState
            title={t("knowledge.host.errorTitle")}
            description={errorMessage}
          />
        ) : null}

        {loadState === "empty" || loadState === "content" ? (
          <div className="grid gap-3">
            <PageHeader
              title={t("knowledge.bases.title")}
              description={t("knowledge.bases.description")}
            />
            <PageToolbar className="flex-nowrap">
              <div className="min-w-0 flex-1">
                <SearchInput
                  className="w-full"
                  testId="knowledge-bases-search"
                  placeholder={t("knowledge.host.searchPlaceholder")}
                  value={search}
                  onChange={setSearch}
                />
              </div>
              <div className="min-w-0 flex-1">
                <Select value={visibility} onValueChange={setVisibility}>
                  <SelectTrigger data-testid="knowledge-bases-visibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("knowledge.host.filterAll")}</SelectItem>
                    <SelectItem value="private">{t("knowledge.host.private")}</SelectItem>
                    <SelectItem value="department">
                      {t("knowledge.host.department")}
                    </SelectItem>
                    <SelectItem value="organization">
                      {t("knowledge.host.organization")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                className="shrink-0"
                data-testid="knowledge-base-create"
                disabled={!mutationsEnabled}
                title={
                  mutationsEnabled ? undefined : t("knowledge.bases.mutateDisabled")
                }
                onClick={() => setDialogOpen(true)}
              >
                {t("knowledge.bases.createLabel")}
              </Button>
            </PageToolbar>
            {!mutationsEnabled ? <p>{t("knowledge.bases.mutateDisabled")}</p> : null}
            {filtered.length === 0 ? (
              <p data-testid="knowledge-base-list-empty">
                {t("knowledge.bases.emptyList")}
              </p>
            ) : (
              <KnowledgeBaseCardGrid
                items={filtered}
                onOpen={openItem}
                statusLabel={statusLabel}
                visibilityLabel={visibilityLabel}
                openLabel={t("knowledge.host.open")}
                emptyDescription={t("knowledge.bases.emptyDescription")}
                ownerLabel={t("knowledge.host.owner")}
                createdAtLabel={t("knowledge.host.createdAt")}
              />
            )}

            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                if (submitting && !open) return;
                setDialogOpen(open);
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("knowledge.bases.createLabel")}</DialogTitle>
                </DialogHeader>
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
              </DialogContent>
            </Dialog>
          </div>
        ) : null}
      </div>
    </BusinessModuleUISurface>
  );
}

export default KnowledgeBasesPage;
