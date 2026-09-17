import { useEffect, useMemo, useState, type ReactElement } from "react";
import { BusinessModuleUISurface } from "@/components/common/business-module-ui-surface";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PageToolbar } from "@/components/common/page-toolbar";
import { SearchInput } from "@/components/common/search-input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "../../../components/useI18n";
import {
  useKnowledgeFacade,
  type UseKnowledgeFacadeOptions,
} from "../../../../../shared/knowledge/use-knowledge-facade";
import type {
  HermesKnowledgeBasesAPI,
  KnowledgeBaseFileSnapshot,
  KnowledgeBaseSnapshot,
  KnowledgeSourceFileStatus,
} from "../../../../../shared/knowledge/knowledge-base-ipc";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeModeSnapshot,
} from "../../../../../shared/knowledge/knowledge-job-ipc";
import type { KnowledgeRouteParams } from "../knowledge-route-descriptor";
import { KnowledgeLoading } from "../knowledge-page-chrome";

const NONE_BASE = "__none__";

export type KnowledgeDocumentsPageProps = {
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

type DocsLoadState = "loading" | "unavailable" | "empty" | "content" | "error";
type FileFilter = "all" | KnowledgeSourceFileStatus | "archived";

const FILE_STATUS_FILTERS: KnowledgeSourceFileStatus[] = [
  "pending",
  "active",
  "updating",
  "error",
  "deleting",
];

function errorCode(error: unknown): string {
  if (error instanceof Error) return error.message.split(/\s/)[0] ?? error.message;
  return "KNOWLEDGE_UNAVAILABLE";
}

async function listDocumentsForBases(
  api: HermesKnowledgeBasesAPI,
  listedBases: KnowledgeBaseSnapshot[],
  knowledgeBaseId: string,
): Promise<KnowledgeBaseFileSnapshot[]> {
  const ids = knowledgeBaseId
    ? [knowledgeBaseId]
    : listedBases.map((base) => base.id);
  if (ids.length === 0) return [];
  const pages = await Promise.all(
    ids.map((id) => api.listFiles({ knowledgeBaseId: id })),
  );
  const items = pages.flatMap((page) => page.items);
  return knowledgeBaseId
    ? items.filter((file) => file.knowledgeBaseId === knowledgeBaseId)
    : items;
}

/**
 * Knowledge Documents list over Base file IPC. Open navigates to
 * KnowledgeDocumentDetailPage via route-scope documentId.
 */
export function KnowledgeDocumentsPage({
  params = {},
  onNavigate,
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
  bases: injectedBases,
}: KnowledgeDocumentsPageProps): ReactElement {
  const { t } = useI18n();
  const probe = useKnowledgeFacade({
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
    bases: injectedBases,
  } satisfies UseKnowledgeFacadeOptions);
  const routeBaseId = params.knowledgeBaseId ?? "";
  const [loadState, setLoadState] = useState<DocsLoadState>("loading");
  const [bases, setBases] = useState<KnowledgeBaseSnapshot[]>([]);
  const [items, setItems] = useState<KnowledgeBaseFileSnapshot[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FileFilter>("all");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (probe.presentation === "loading") {
      setLoadState("loading");
      return;
    }
    if (probe.presentation === "unavailable") {
      setLoadState("unavailable");
      return;
    }
    if (!probe.bases) {
      setBases([]);
      setItems([]);
      setLoadState("empty");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const listedBases = await probe.bases!.list();
        if (cancelled) return;
        setBases(listedBases.items);
        const scoped = await listDocumentsForBases(
          probe.bases!,
          listedBases.items,
          routeBaseId,
        );
        if (cancelled) return;
        setItems(scoped);
        setLoadState(scoped.length > 0 ? "content" : "empty");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(errorCode(error));
        setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [probe.presentation, probe.bases, routeBaseId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "archived") {
        if (!item.archivedAt) return false;
      } else if (filter !== "all" && item.status !== filter) {
        return false;
      }
      if (!q) return true;
      return item.fileName.toLowerCase().includes(q);
    });
  }, [items, filter, search]);

  const baseNameById = useMemo(() => {
    const names = new Map<string, string>();
    for (const base of bases) {
      names.set(base.id, base.name);
    }
    return names;
  }, [bases]);

  const statusLabel = (status: KnowledgeSourceFileStatus): string => {
    switch (status) {
      case "pending":
        return t("knowledge.documents.statusPending");
      case "active":
        return t("knowledge.documents.statusActive");
      case "updating":
        return t("knowledge.documents.statusUpdating");
      case "error":
        return t("knowledge.documents.statusError");
      case "deleting":
        return t("knowledge.documents.statusDeleting");
      default:
        return status;
    }
  };

  return (
    <BusinessModuleUISurface module="knowledge">
      <div data-testid="knowledge-documents-page" data-state={loadState}>
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
              title={t("knowledge.documents.title")}
              description={t("knowledge.documents.description")}
            />
            <PageToolbar className="flex-nowrap">
              <div className="min-w-0 flex-1">
                <Select
                  value={routeBaseId || NONE_BASE}
                  onValueChange={(value) => {
                    onNavigate?.({
                      page: "documents",
                      params: value === NONE_BASE ? {} : { knowledgeBaseId: value },
                    });
                  }}
                >
                  <SelectTrigger data-testid="knowledge-documents-base">
                    <SelectValue placeholder={t("knowledge.documents.allBases")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_BASE} data-testid="knowledge-documents-base-none">
                      {t("knowledge.documents.allBases")}
                    </SelectItem>
                    {bases.map((base) => (
                      <SelectItem
                        key={base.id}
                        value={base.id}
                        data-testid={`knowledge-documents-base-${base.id}`}
                      >
                        {base.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 flex-1">
                <SearchInput
                  className="w-full"
                  testId="knowledge-documents-search"
                  placeholder={t("knowledge.host.searchPlaceholder")}
                  value={search}
                  onChange={setSearch}
                />
              </div>
              <div className="min-w-0 flex-1">
                <Select
                  value={filter}
                  onValueChange={(value) => setFilter(value as FileFilter)}
                >
                  <SelectTrigger data-testid="knowledge-documents-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("knowledge.host.filterAll")}</SelectItem>
                    {FILE_STATUS_FILTERS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {statusLabel(status)}
                      </SelectItem>
                    ))}
                    <SelectItem value="archived">
                      {t("knowledge.documents.filterArchived")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </PageToolbar>
            {filtered.length === 0 ? (
              <p data-testid="knowledge-document-list-empty">
                {t("knowledge.documents.emptyList")}
              </p>
            ) : (
              <Table data-testid="knowledge-document-list">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("knowledge.documents.baseLabel")}</TableHead>
                    <TableHead>{t("knowledge.bases.fileName")}</TableHead>
                    <TableHead>{t("knowledge.bases.fileStatus")}</TableHead>
                    <TableHead>{t("knowledge.host.owner")}</TableHead>
                    <TableHead>{t("knowledge.host.createdAt")}</TableHead>
                    <TableHead>{t("knowledge.bases.fileVersion")}</TableHead>
                    <TableHead>{t("knowledge.bases.fileLastError")}</TableHead>
                    <TableHead>{t("knowledge.host.open")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow
                      key={item.id}
                      data-testid={`knowledge-document-row-${item.id}`}
                    >
                      <TableCell data-testid={`knowledge-document-base-${item.id}`}>
                        {baseNameById.get(item.knowledgeBaseId) ?? item.knowledgeBaseId}
                      </TableCell>
                      <TableCell>{item.fileName}</TableCell>
                      <TableCell>{statusLabel(item.status)}</TableCell>
                      <TableCell data-testid={`knowledge-document-owner-${item.id}`}>
                        {item.ownerMemberId ?? ""}
                      </TableCell>
                      <TableCell data-testid={`knowledge-document-created-${item.id}`}>
                        {item.createdAt ?? ""}
                      </TableCell>
                      <TableCell>{item.activeVersionId ?? ""}</TableCell>
                      <TableCell>{item.lastError ?? ""}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-testid={`knowledge-document-item-${item.id}`}
                          onClick={() =>
                            onNavigate?.({
                              page: "documents",
                              params: {
                                knowledgeBaseId: routeBaseId || item.knowledgeBaseId,
                                documentId: item.id,
                              },
                            })
                          }
                        >
                          {t("knowledge.host.open")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        ) : null}
      </div>
    </BusinessModuleUISurface>
  );
}

export default KnowledgeDocumentsPage;
