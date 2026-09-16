import { useEffect, useState, type ReactElement } from "react";
import { useI18n } from "../../../components/useI18n";
import {
  useKnowledgeFacade,
  type UseKnowledgeFacadeOptions,
} from "../../../../../shared/knowledge/use-knowledge-facade";
import {
  knowledgeBaseActionAllowed,
  type HermesKnowledgeBasesAPI,
  type KnowledgeBaseFileSnapshot,
  type KnowledgeBaseSnapshot,
  type KnowledgeBaseVisibility,
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
  KnowledgeSectionTabs,
} from "../knowledge-page-chrome";
import { KnowledgeBaseSettingsForm } from "../features/bases/edit/KnowledgeBaseSettingsForm";
import { KnowledgeBaseDeleteConfirm } from "../features/bases/delete/KnowledgeBaseDeleteConfirm";

export type KnowledgeBaseDetailPageProps = {
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

type DetailLoadState = "loading" | "unavailable" | "not-found" | "content" | "error";
type DetailTab = "documents" | "settings";

function errorCode(error: unknown): string {
  if (error instanceof Error) return error.message.split(/\s/)[0] ?? error.message;
  return "KNOWLEDGE_UNAVAILABLE";
}

export function KnowledgeBaseDetailPage({
  params = {},
  onNavigate,
  onBack,
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
  bases: injectedBases,
}: KnowledgeBaseDetailPageProps): ReactElement {
  const { t } = useI18n();
  const probe = useKnowledgeFacade({
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
    bases: injectedBases,
  } satisfies UseKnowledgeFacadeOptions);
  const detailId = params.knowledgeBaseId ?? "";
  const [loadState, setLoadState] = useState<DetailLoadState>("loading");
  const [detail, setDetail] = useState<KnowledgeBaseSnapshot | null>(null);
  const [files, setFiles] = useState<KnowledgeBaseFileSnapshot[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftVisibility, setDraftVisibility] =
    useState<KnowledgeBaseVisibility>("organization");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("documents");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (probe.presentation === "loading") {
      setLoadState("loading");
      return;
    }
    if (probe.presentation === "unavailable") {
      setLoadState("unavailable");
      return;
    }
    if (!detailId || !probe.bases) {
      setLoadState("not-found");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const entity = await probe.bases!.get({ knowledgeBaseId: detailId });
        if (cancelled) return;
        setDetail(entity);
        setDraftName(entity.name);
        setDraftDescription(entity.description ?? "");
        setDraftVisibility(entity.visibility);
        const listed = await probe.bases!.listFiles({
          knowledgeBaseId: detailId,
        });
        if (cancelled) return;
        setFiles(listed.items);
        setLoadState("content");
      } catch (error) {
        if (cancelled) return;
        const code = errorCode(error);
        if (code === "KNOWLEDGE_NOT_FOUND") {
          setDetail(null);
          setLoadState("not-found");
          return;
        }
        setErrorMessage(code);
        setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [probe.presentation, probe.bases, detailId]);

  const saveEnabled =
    probe.mutationsEnabled && knowledgeBaseActionAllowed(detail?.status, "save");
  const deleteEnabled =
    probe.mutationsEnabled && knowledgeBaseActionAllowed(detail?.status, "delete");
  const uploadEnabled =
    probe.mutationsEnabled && knowledgeBaseActionAllowed(detail?.status, "upload");

  const handleSave = async (): Promise<void> => {
    if (!saveEnabled || !probe.bases || !detailId || submitting) return;
    setSubmitting(true);
    try {
      const updated = await probe.bases.update({
        knowledgeBaseId: detailId,
        name: draftName.trim() || detail?.name,
        description: draftDescription.trim() ? draftDescription.trim() : null,
        visibility: draftVisibility,
      });
      setDetail(updated);
    } catch (error) {
      setErrorMessage(errorCode(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleteEnabled || !probe.bases || !detailId || submitting) return;
    setSubmitting(true);
    try {
      await probe.bases.delete({ knowledgeBaseId: detailId });
      setConfirmDelete(false);
      onBack?.();
    } catch (error) {
      setErrorMessage(errorCode(error));
      setConfirmDelete(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-testid="knowledge-bases-page" data-state={loadState}>
      <div className="knowledge-toolbar">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          data-testid="knowledge-bases-back"
          onClick={() => onBack?.()}
        >
          {t("knowledge.host.back")}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          data-testid="knowledge-base-upload"
          disabled={!uploadEnabled || !onNavigate}
          onClick={() =>
            onNavigate?.({
              page: "uploads",
              params: { knowledgeBaseId: detailId },
            })
          }
        >
          {t("knowledge.bases.uploadAction")}
        </button>
      </div>
      {loadState === "loading" ? (
        <KnowledgeLoading label={t("knowledge.loading")} />
      ) : null}
      {loadState === "unavailable" ? (
        <KnowledgeEmptyState
          title={t("knowledge.unavailableTitle")}
          description={t("knowledge.unavailableDescription")}
        />
      ) : null}
      {loadState === "not-found" ? (
        <KnowledgeEmptyState
          testId="knowledge-base-not-found"
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
        <section className="settings-section" data-testid="knowledge-base-detail">
          <h2>{detail.name}</h2>
          <p data-testid="knowledge-base-detail-id">{detail.id}</p>
          <p data-testid="knowledge-base-detail-status">{detail.status}</p>
          <KnowledgeSectionTabs
            active={detailTab}
            onChange={setDetailTab}
            tabs={[
              { id: "documents", label: t("knowledge.bases.tabDocuments") },
              { id: "settings", label: t("knowledge.bases.tabSettings") },
            ]}
          />

          <div hidden={detailTab !== "documents"}>
            <p>{t("knowledge.bases.documentsNote")}</p>
            {files.length === 0 ? (
              <p>{t("knowledge.documents.emptyList")}</p>
            ) : (
              <ul data-testid="knowledge-base-files">
                {files.map((file) => (
                  <li key={file.id}>
                    {file.fileName} ({file.status})
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div hidden={detailTab !== "settings"}>
            <KnowledgeBaseSettingsForm
              name={draftName}
              description={draftDescription}
              visibility={draftVisibility}
              saveEnabled={saveEnabled}
              submitting={submitting}
              onNameChange={setDraftName}
              onDescriptionChange={setDraftDescription}
              onVisibilityChange={setDraftVisibility}
              onSave={() => {
                void handleSave();
              }}
              editLabel={t("knowledge.host.edit")}
              descriptionLabel={t("knowledge.bases.descriptionLabel")}
              visibilityLabel={t("knowledge.host.visibility")}
              saveLabel={t("knowledge.host.save")}
              privateLabel={t("knowledge.host.private")}
              departmentLabel={t("knowledge.host.department")}
              organizationLabel={t("knowledge.host.organization")}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid="knowledge-base-delete"
              disabled={!deleteEnabled || submitting}
              title={
                deleteEnabled ? undefined : t("knowledge.bases.mutateDisabled")
              }
              onClick={() => setConfirmDelete(true)}
            >
              {t("knowledge.bases.deleteLabel")}
            </button>
            {!probe.mutationsEnabled ? (
              <p>{t("knowledge.bases.mutateDisabled")}</p>
            ) : null}
          </div>

          {errorMessage ? <p>{errorMessage}</p> : null}

          <KnowledgeEntityModal
            open={confirmDelete}
            onOpenChange={(open) => {
              if (submitting && !open) return;
              setConfirmDelete(open);
            }}
            submitting={submitting}
            title={t("knowledge.bases.deleteLabel")}
          >
            <KnowledgeBaseDeleteConfirm
              submitting={submitting}
              onCancel={() => {
                if (!submitting) setConfirmDelete(false);
              }}
              onConfirm={() => {
                void handleDelete();
              }}
              cancelLabel={t("knowledge.host.cancel")}
              confirmLabel={t("knowledge.host.confirm")}
            />
          </KnowledgeEntityModal>
        </section>
      ) : null}
    </div>
  );
}

export default KnowledgeBaseDetailPage;
