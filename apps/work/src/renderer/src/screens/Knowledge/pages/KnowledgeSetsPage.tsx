import { useEffect, useMemo, useState, type ReactElement } from "react";
import { BusinessModuleUISurface } from "@/components/common/business-module-ui-surface";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PageToolbar } from "@/components/common/page-toolbar";
import { SearchInput } from "@/components/common/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "../../../components/useI18n";
import {
  useKnowledgeFacade,
  type UseKnowledgeFacadeOptions,
} from "../../../../../shared/knowledge/use-knowledge-facade";
import type {
  HermesKnowledgeSetsAPI,
  KnowledgeSetSnapshot,
  KnowledgeSetStatus,
  KnowledgeSetVisibility,
} from "../../../../../shared/knowledge/knowledge-set-ipc";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeModeSnapshot,
} from "../../../../../shared/knowledge/knowledge-job-ipc";
import type { HermesKnowledgeBasesAPI } from "../../../../../shared/knowledge/knowledge-base-ipc";
import type { KnowledgeRouteParams } from "../knowledge-route-descriptor";
import { KnowledgeLoading } from "../knowledge-page-chrome";

export type KnowledgeSetsPageProps = {
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
  sets?: HermesKnowledgeSetsAPI | null;
};

type SetsLoadState = "loading" | "unavailable" | "empty" | "content" | "error";

function errorCode(error: unknown): string {
  if (error instanceof Error) return error.message.split(/\s/)[0] ?? error.message;
  return "KNOWLEDGE_UNAVAILABLE";
}

export function KnowledgeSetsPage({
  onNavigate,
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
  bases: injectedBases,
  sets: injectedSets,
}: KnowledgeSetsPageProps): ReactElement {
  const { t } = useI18n();
  const probe = useKnowledgeFacade({
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
    bases: injectedBases,
    sets: injectedSets,
  } satisfies UseKnowledgeFacadeOptions);
  const [loadState, setLoadState] = useState<SetsLoadState>("loading");
  const [items, setItems] = useState<KnowledgeSetSnapshot[]>([]);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftVisibility, setDraftVisibility] =
    useState<KnowledgeSetVisibility>("organization");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refreshList = async (): Promise<void> => {
    if (!probe.sets) {
      setItems([]);
      setLoadState(
        probe.presentation === "unavailable" ? "unavailable" : "empty",
      );
      return;
    }
    const page = await probe.sets.list({ page: 1, pageSize: 50 });
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
  }, [probe.presentation, probe.sets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, search]);

  const mutationsEnabled = probe.mutationsEnabled;
  const statusLabel = (status: KnowledgeSetStatus): string =>
    t(`knowledge.sets.status.${status}`);
  const visibilityLabel = (value: KnowledgeSetVisibility): string => {
    if (value === "private") return t("knowledge.host.private");
    if (value === "department") return t("knowledge.host.department");
    return t("knowledge.host.organization");
  };

  const handleCreate = async (): Promise<void> => {
    if (!mutationsEnabled || !probe.sets || submitting) return;
    const name = draftName.trim();
    if (!name) return;
    setSubmitting(true);
    try {
      await probe.sets.create({
        name,
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
    onNavigate?.({ page: "sets", params: { knowledgeSetId: id } });
  };

  return (
    <BusinessModuleUISurface module="knowledge">
      <div data-testid="knowledge-sets-page" data-state={loadState}>
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
              title={t("knowledge.sets.title")}
              description={t("knowledge.sets.description")}
            />
            <PageToolbar className="flex-nowrap">
              <div className="min-w-0 flex-1">
                <SearchInput
                  className="w-full"
                  testId="knowledge-sets-search"
                  placeholder={t("knowledge.host.searchPlaceholder")}
                  value={search}
                  onChange={setSearch}
                />
              </div>
              <Button
                type="button"
                className="shrink-0"
                data-testid="knowledge-set-create"
                disabled={!mutationsEnabled || !probe.sets}
                title={
                  mutationsEnabled ? undefined : t("knowledge.sets.mutateDisabled")
                }
                onClick={() => setDialogOpen(true)}
              >
                {t("knowledge.sets.createLabel")}
              </Button>
            </PageToolbar>
            {!mutationsEnabled ? <p>{t("knowledge.sets.mutateDisabled")}</p> : null}
            {filtered.length === 0 ? (
              <p data-testid="knowledge-set-list-empty">
                {t("knowledge.sets.emptyList")}
              </p>
            ) : (
              <div
                className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2 min-[1000px]:grid-cols-3 min-[1400px]:grid-cols-4"
                data-testid="knowledge-set-list"
              >
                {filtered.map((item) => (
                  <Card
                    key={item.id}
                    className="flex h-full cursor-pointer flex-col shadow-none"
                    data-testid={`knowledge-set-item-${item.id}`}
                    onClick={() => openItem(item.id)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="line-clamp-1 text-base">
                          {item.name}
                        </CardTitle>
                        <Badge variant="outline">{statusLabel(item.status)}</Badge>
                      </div>
                      <CardDescription className="line-clamp-2">
                        {item.description || t("knowledge.sets.emptyDescription")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 text-muted-foreground text-sm">
                      <p>{visibilityLabel(item.visibility)}</p>
                      <p data-testid={`knowledge-set-owner-${item.id}`}>
                        {t("knowledge.host.owner")}: {item.ownerMemberId ?? "—"}
                      </p>
                      <p data-testid={`knowledge-set-bound-count-${item.id}`}>
                        {t("knowledge.sets.boundBases")}: {item.knowledgeBases.length}
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          openItem(item.id);
                        }}
                      >
                        {t("knowledge.host.open")}
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
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
                  <DialogTitle>{t("knowledge.sets.createLabel")}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                  <div className="grid gap-1">
                    <Label htmlFor="knowledge-set-create-name">
                      {t("knowledge.host.namePlaceholder")}
                    </Label>
                    <Input
                      id="knowledge-set-create-name"
                      data-testid="knowledge-set-create-name"
                      value={draftName}
                      disabled={!mutationsEnabled || submitting}
                      onChange={(event) => setDraftName(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="knowledge-set-create-description">
                      {t("knowledge.sets.descriptionLabel")}
                    </Label>
                    <Textarea
                      id="knowledge-set-create-description"
                      data-testid="knowledge-set-create-description"
                      value={draftDescription}
                      disabled={!mutationsEnabled || submitting}
                      onChange={(event) => setDraftDescription(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label>{t("knowledge.host.visibility")}</Label>
                    <Select
                      value={draftVisibility}
                      disabled={!mutationsEnabled || submitting}
                      onValueChange={(value) =>
                        setDraftVisibility(value as KnowledgeSetVisibility)
                      }
                    >
                      <SelectTrigger data-testid="knowledge-set-create-visibility">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="private">
                          {t("knowledge.host.private")}
                        </SelectItem>
                        <SelectItem value="department">
                          {t("knowledge.host.department")}
                        </SelectItem>
                        <SelectItem value="organization">
                          {t("knowledge.host.organization")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting}
                      onClick={() => setDialogOpen(false)}
                    >
                      {t("knowledge.host.cancel")}
                    </Button>
                    <Button
                      type="button"
                      data-testid="knowledge-set-create-submit"
                      disabled={
                        !mutationsEnabled || submitting || !draftName.trim()
                      }
                      onClick={() => {
                        void handleCreate();
                      }}
                    >
                      {t("knowledge.host.create")}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        ) : null}
      </div>
    </BusinessModuleUISurface>
  );
}

export default KnowledgeSetsPage;
