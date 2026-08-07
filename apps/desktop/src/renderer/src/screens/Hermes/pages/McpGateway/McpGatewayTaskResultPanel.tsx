import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  HermesArtifactSummary,
  HermesTaskResult,
  RecentHermesTask,
} from "../../../../../../shared/hermes-client/hermes-client-contract";

type Props = {
  enabled: boolean;
  recentTasks: RecentHermesTask[];
  selectedTaskId: string | null;
  taskResult: HermesTaskResult | null;
  taskEvents: Array<Record<string, unknown>>;
  taskEventsError: string | null;
  pending: boolean;
  onSelectTask: (taskId: string) => void;
  onLoadResult: (taskId: string) => void;
  onSubscribeEvents: (taskId: string) => void;
  onPreviewArtifact: (artifactId: string) => Promise<{ ok: boolean; text?: string; error?: string }>;
  onDownloadArtifact: (artifactId: string) => void;
  onClearRecent: () => void;
};

function ArtifactActions({
  artifact,
  onPreview,
  onDownload,
}: {
  artifact: HermesArtifactSummary;
  onPreview: (id: string) => Promise<{ ok: boolean; text?: string; error?: string }>;
  onDownload: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  return (
    <li className="hermes-mcp-gateway-tools-item">
      <div>
        <strong>{artifact.title ?? artifact.file_name}</strong>
        <span className="hermes-muted"> ({artifact.content_type ?? artifact.artifact_type})</span>
      </div>
      <div className="hermes-mcp-gateway-section__actions">
        <button
          type="button"
          className="hermes-btn-ghost"
          onClick={() => {
            void onPreview(artifact.id).then((res) => {
              if (res.ok && res.text) {
                setPreview(res.text);
                setPreviewError(null);
              } else {
                setPreviewError(res.error ?? "Preview failed");
              }
            });
          }}
        >
          {t("workspaces.hermes.mcpGateway.taskPreviewArtifact")}
        </button>
        <button
          type="button"
          className="hermes-btn-ghost"
          onClick={() => onDownload(artifact.id)}
        >
          {t("workspaces.hermes.mcpGateway.taskDownloadArtifact")}
        </button>
        {preview ? (
          <button
            type="button"
            className="hermes-btn-ghost"
            onClick={() => void navigator.clipboard.writeText(preview)}
          >
            {t("workspaces.hermes.mcpGateway.taskCopyPreview")}
          </button>
        ) : null}
      </div>
      {previewError ? <p className="hermes-page__error">{previewError}</p> : null}
      {preview ? <pre className="hermes-panel-pre">{preview}</pre> : null}
    </li>
  );
}

export function McpGatewayTaskResultPanel({
  enabled,
  recentTasks,
  selectedTaskId,
  taskResult,
  taskEvents,
  taskEventsError,
  pending,
  onSelectTask,
  onLoadResult,
  onSubscribeEvents,
  onPreviewArtifact,
  onDownloadArtifact,
  onClearRecent,
}: Props) {
  const { t } = useTranslation();
  const [manualTaskId, setManualTaskId] = useState("");

  useEffect(() => {
    if (selectedTaskId) {
      setManualTaskId(selectedTaskId);
    }
  }, [selectedTaskId]);

  if (!enabled) return null;

  const activeId = selectedTaskId ?? manualTaskId.trim();

  return (
    <section className="hermes-mcp-gateway-section">
      <div className="hermes-mcp-gateway-section__head">
        <h3>{t("workspaces.hermes.mcpGateway.taskResultTitle")}</h3>
        <button type="button" className="hermes-btn-ghost" onClick={onClearRecent}>
          {t("workspaces.hermes.mcpGateway.taskClearRecent")}
        </button>
      </div>
      <label className="hermes-mcp-gateway-field">
        <span>{t("workspaces.hermes.mcpGateway.taskId")}</span>
        <input
          className="hermes-input"
          value={manualTaskId}
          onChange={(e) => setManualTaskId(e.target.value)}
          placeholder={t("workspaces.hermes.mcpGateway.taskIdPlaceholder")}
        />
      </label>
      <div className="hermes-mcp-gateway-section__actions">
        <button
          type="button"
          className="hermes-btn-primary"
          disabled={pending || !activeId}
          onClick={() => {
            onSelectTask(activeId);
            onLoadResult(activeId);
          }}
        >
          {t("workspaces.hermes.mcpGateway.taskLoadResult")}
        </button>
        <button
          type="button"
          className="hermes-btn-ghost"
          disabled={pending || !activeId}
          onClick={() => onSubscribeEvents(activeId)}
        >
          {t("workspaces.hermes.mcpGateway.taskSubscribeEvents")}
        </button>
      </div>
      {recentTasks.length > 0 ? (
        <ul className="hermes-mcp-gateway-tools-list">
          {recentTasks.map((task) => (
            <li key={task.taskId}>
              <button
                type="button"
                className="hermes-btn-ghost"
                onClick={() => {
                  onSelectTask(task.taskId);
                  setManualTaskId(task.taskId);
                  onLoadResult(task.taskId);
                }}
              >
                {task.taskId}
                {task.toolName ? ` · ${task.toolName}` : ""}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hermes-muted">{t("workspaces.hermes.mcpGateway.taskRecentEmpty")}</p>
      )}
      {taskResult ? (
        <>
          <p className="hermes-muted">
            {t("workspaces.hermes.mcpGateway.taskStatus")}: {taskResult.task.status}
            {taskResult.result_summary ? ` — ${taskResult.result_summary}` : ""}
          </p>
          {taskResult.primary_artifact ? (
            <ul className="hermes-mcp-gateway-tools-list">
              <ArtifactActions
                artifact={taskResult.primary_artifact}
                onPreview={onPreviewArtifact}
                onDownload={onDownloadArtifact}
              />
            </ul>
          ) : null}
          {taskResult.artifacts.length > 0 ? (
            <ul className="hermes-mcp-gateway-tools-list">
              {taskResult.artifacts.map((artifact) => (
                <ArtifactActions
                  key={artifact.id}
                  artifact={artifact}
                  onPreview={onPreviewArtifact}
                  onDownload={onDownloadArtifact}
                />
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      {taskEventsError ? <p className="hermes-page__error">{taskEventsError}</p> : null}
      {taskEvents.length > 0 ? (
        <pre className="hermes-panel-pre">{JSON.stringify(taskEvents, null, 2)}</pre>
      ) : null}
    </section>
  );
}
