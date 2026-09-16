import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Button } from "../../../components/ui/Button";
import { Card, CardHead, CardTitle } from "../../../components/ui/Card";
import { Checkbox } from "../../../components/ui/Checkbox";
import { FormField } from "../../../components/ui/FormField";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { useI18n } from "../../../components/useI18n";
import {
  useKnowledgeFacade,
  type UseKnowledgeFacadeOptions,
} from "../../../../../shared/knowledge/use-knowledge-facade";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeFacadeEntitySnapshot,
  KnowledgeModeSnapshot,
} from "../../../../../shared/knowledge/knowledge-job-ipc";
import type { KnowledgeRouteParams } from "../knowledge-route-descriptor";
import {
  KnowledgeEmptyState,
  KnowledgeEntityModal,
  KnowledgeLoading,
  KnowledgeSearchInput,
  KnowledgeSectionTabs,
  KnowledgeToolbar,
} from "../knowledge-page-chrome";

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
};

type SetsLoadState =
  | "loading"
  | "unavailable"
  | "empty"
  | "content"
  | "not-found"
  | "error";

type SetDetailTab = "info" | "bindings" | "retrieval" | "usage";

/**
 * Knowledge Sets list/detail with local binding/weight drafts; provider submit disabled.
 */
export function KnowledgeSetsPage({
  params = {},
  onNavigate,
  onBack,
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
}: KnowledgeSetsPageProps): ReactElement {
  const { t } = useI18n();
  const probe = useKnowledgeFacade({
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
  } satisfies UseKnowledgeFacadeOptions);
  const detailId = params.knowledgeSetId;
  const [loadState, setLoadState] = useState<SetsLoadState>("loading");
  const [items, setItems] = useState<KnowledgeFacadeEntitySnapshot[]>([]);
  const [bases, setBases] = useState<KnowledgeFacadeEntitySnapshot[]>([]);
  const [detail, setDetail] = useState<KnowledgeFacadeEntitySnapshot | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [bindingWeight, setBindingWeight] = useState("1");
  const [retrievalMode, setRetrievalMode] = useState("hybrid");
  const [selectedBaseIds, setSelectedBaseIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<SetDetailTab>("bindings");

  const refreshList = async (): Promise<void> => {
    if (!probe.facade || probe.mode?.dataMode !== "mock") {
      setItems([]);
      setLoadState(
        probe.presentation === "unavailable" ? "unavailable" : "empty",
      );
      return;
    }
    const listed = await probe.facade.listEntities({ kind: "set" });
    setItems(listed);
    setLoadState(listed.length > 0 ? "content" : "empty");
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
        if (detailId) {
          if (!probe.facade || probe.mode?.dataMode !== "mock") {
            if (!cancelled) setLoadState("not-found");
            return;
          }
          const entity = await probe.facade.getEntity({
            kind: "set",
            entityId: detailId,
          });
          if (cancelled) return;
          if (!entity) {
            setDetail(null);
            setLoadState("not-found");
            return;
          }
          setDetail(entity);
          setDraftTitle(entity.title ?? "");
          const baseList = await probe.facade.listEntities({ kind: "base" });
          if (cancelled) return;
          setBases(baseList);
          setLoadState("content");
          return;
        }
        await refreshList();
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error ? error.message : t("knowledge.host.errorTitle"),
        );
        setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe.presentation, probe.facade, probe.mode?.dataMode, detailId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      (item.title ?? item.id).toLowerCase().includes(q),
    );
  }, [items, search]);

  const mutationsEnabled = probe.syntheticMutationsEnabled;

  const handleCreate = async (): Promise<void> => {
    if (!mutationsEnabled || !probe.facade) return;
    await probe.facade.mutateEntity({
      kind: "set",
      patch: { title: draftTitle.trim() || "New set" },
    });
    setDraftTitle("");
    setDialogOpen(false);
    await refreshList();
  };

  const handleSubmitBindings = async (): Promise<void> => {
    if (!mutationsEnabled || !probe.facade || !detailId) return;
    const updated = await probe.facade.mutateEntity({
      kind: "set",
      entityId: detailId,
      patch: {
        title: draftTitle.trim() || detail?.title || "Set",
        weight: Number(bindingWeight) || 1,
        retrieval: retrievalMode,
        boundBaseIds: Array.from(selectedBaseIds).join(","),
      },
    });
    setDetail(updated);
  };

  const toggleBase = (id: string): void => {
    setSelectedBaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (detailId) {
    return (
      <div data-testid="knowledge-sets-page" data-state={loadState}>
        <Button
          size="sm"
          data-testid="knowledge-sets-back"
          onClick={() => onBack?.()}
        >
          {t("knowledge.host.back")}
        </Button>
        {loadState === "loading" ? (
          <KnowledgeLoading label={t("knowledge.loading")} />
        ) : null}
        {loadState === "not-found" ? (
          <KnowledgeEmptyState
            testId="knowledge-set-not-found"
            title={t("knowledge.host.notFoundTitle")}
            description={t("knowledge.host.notFoundDescription")}
          />
        ) : null}
        {loadState === "error" ? (
          <KnowledgeEmptyState
            title={t("knowledge.host.errorTitle")}
            description={errorMessage}
          />
        ) : null}
        {loadState === "content" && detail ? (
          <section data-testid="knowledge-set-detail">
            <h2>{detail.title ?? t("knowledge.sets.detailTitle")}</h2>
            <p data-testid="knowledge-set-detail-id">{detail.id}</p>
            <KnowledgeSectionTabs
              active={detailTab}
              onChange={setDetailTab}
              tabs={[
                { id: "info", label: t("knowledge.sets.tabInfo") },
                { id: "bindings", label: t("knowledge.sets.tabBindings") },
                { id: "retrieval", label: t("knowledge.sets.tabRetrieval") },
                { id: "usage", label: t("knowledge.sets.tabUsage") },
              ]}
            />

            <div hidden={detailTab !== "info"}>
              <FormField label={t("knowledge.host.edit")} htmlFor="knowledge-set-title-input">
                <Input
                  id="knowledge-set-title-input"
                  data-testid="knowledge-set-title-input"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  disabled={!mutationsEnabled}
                />
              </FormField>
              <p>
                {t("knowledge.sets.boundBases")}: {selectedBaseIds.size}
              </p>
            </div>

            <section
              hidden={detailTab !== "bindings"}
              data-testid="knowledge-set-bindings"
            >
              <h3>{t("knowledge.sets.bindingTitle")}</h3>
              <FormField label={t("knowledge.sets.weightLabel")} htmlFor="knowledge-set-weight">
                <Input
                  id="knowledge-set-weight"
                  data-testid="knowledge-set-weight"
                  value={bindingWeight}
                  onChange={(event) => setBindingWeight(event.target.value)}
                  disabled={!mutationsEnabled}
                />
              </FormField>
              {bases.length === 0 ? (
                <p>{t("knowledge.sets.noBases")}</p>
              ) : (
                <ul>
                  {bases.map((base) => (
                    <li key={base.id}>
                      <Checkbox
                        label={base.title ?? base.id}
                        checked={selectedBaseIds.has(base.id)}
                        disabled={!mutationsEnabled}
                        onChange={() => toggleBase(base.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              hidden={detailTab !== "retrieval"}
              data-testid="knowledge-set-retrieval"
            >
              <h3>{t("knowledge.sets.retrievalTitle")}</h3>
              <Select
                data-testid="knowledge-set-retrieval-mode"
                value={retrievalMode}
                onChange={(event) => setRetrievalMode(event.target.value)}
                disabled={!mutationsEnabled}
              >
                <option value="hybrid">hybrid</option>
                <option value="keyword">keyword</option>
                <option value="vector">vector</option>
              </Select>
            </section>

            <div hidden={detailTab !== "usage"}>
              <p>{t("knowledge.sets.usageEmpty")}</p>
            </div>

            <Button
              size="sm"
              data-testid="knowledge-set-submit"
              disabled={!mutationsEnabled}
              title={
                mutationsEnabled ? undefined : t("knowledge.sets.mutateDisabled")
              }
              onClick={() => {
                void handleSubmitBindings();
              }}
            >
              {t("knowledge.sets.submitBindings")}
            </Button>
            {!mutationsEnabled ? (
              <p>{t("knowledge.sets.mutateDisabled")}</p>
            ) : null}
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid="knowledge-sets-page" data-state={loadState}>
      {loadState === "loading" ? (
        <KnowledgeLoading label={t("knowledge.loading")} />
      ) : null}
      {loadState === "unavailable" ? (
        <KnowledgeEmptyState
          title={t("knowledge.unavailableTitle")}
          description={t("knowledge.unavailableDescription")}
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
              testId="knowledge-sets-search"
              placeholder={t("knowledge.host.searchPlaceholder")}
              value={search}
              onChange={setSearch}
            />
            <Button
              size="sm"
              variant="primary"
              data-testid="knowledge-set-create"
              disabled={!mutationsEnabled}
              title={
                mutationsEnabled ? undefined : t("knowledge.sets.mutateDisabled")
              }
              onClick={() => setDialogOpen(true)}
            >
              {t("knowledge.sets.createLabel")}
            </Button>
          </KnowledgeToolbar>
          {!mutationsEnabled ? <p>{t("knowledge.sets.mutateDisabled")}</p> : null}
          {filtered.length === 0 ? (
            <p data-testid="knowledge-set-list-empty">
              {t("knowledge.sets.emptyList")}
            </p>
          ) : (
            <div className="knowledge-card-grid" data-testid="knowledge-set-list">
              {filtered.map((item) => (
                <Card key={item.id}>
                  <CardHead>
                    <CardTitle>{item.title ?? item.id}</CardTitle>
                  </CardHead>
                  <div className="knowledge-toolbar">
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`knowledge-set-item-${item.id}`}
                      onClick={() =>
                        onNavigate?.({
                          page: "sets",
                          params: { knowledgeSetId: item.id },
                        })
                      }
                    >
                      {t("knowledge.sets.manage")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!onNavigate}
                      onClick={() => onNavigate?.({ page: "chat", params: {} })}
                    >
                      {t("knowledge.sets.startChat")}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <KnowledgeEntityModal
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            title={t("knowledge.sets.createLabel")}
          >
            <FormField
              label={t("knowledge.host.namePlaceholder")}
              htmlFor="knowledge-set-create-title"
            >
              <Input
                id="knowledge-set-create-title"
                data-testid="knowledge-set-create-title"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                disabled={!mutationsEnabled}
                placeholder={t("knowledge.sets.createLabel")}
              />
            </FormField>
            <div className="knowledge-toolbar">
              <Button size="sm" onClick={() => setDialogOpen(false)}>
                {t("knowledge.host.cancel")}
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!mutationsEnabled}
                onClick={() => {
                  void handleCreate();
                }}
              >
                {t("knowledge.host.create")}
              </Button>
            </div>
          </KnowledgeEntityModal>
        </>
      ) : null}
    </div>
  );
}

export default KnowledgeSetsPage;
