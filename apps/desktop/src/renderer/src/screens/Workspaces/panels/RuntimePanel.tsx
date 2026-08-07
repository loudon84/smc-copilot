import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../../components/useI18n";
import { workspacesApi } from "../api/workspacesApi";
import { useWorkspaces } from "../context/WorkspacesContext";

type AuditRow = {
  id: string;
  event_type: string;
  action: string;
  status: string;
  created_at: string;
};

const MAX_EVENTS = 20;

export function RuntimePanel(): React.JSX.Element {
  const { t } = useI18n();
  const { activeProfileId, runtime } = useWorkspaces();
  const [logs, setLogs] = useState("");
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [profileEvents, setProfileEvents] = useState<AuditRow[]>([]);

  const loadLogs = useCallback(async () => {
    if (!activeProfileId) return;
    try {
      const entries = await workspacesApi.getGatewayLogs(activeProfileId, { limit: 80 });
      setLogs(entries.map((l) => `[${l.timestamp}] ${l.level}: ${l.message}`).join("\n"));
    } catch (err) {
      setLogs(String(err));
    }
  }, [activeProfileId]);

  const loadAudit = useCallback(async () => {
    if (!activeProfileId) {
      setAuditRows([]);
      return;
    }
    try {
      const rows = await workspacesApi.listAuditEvents(activeProfileId, 30);
      const mapped = rows.map((r) => ({
        id: r.id,
        event_type: r.event_type,
        action: r.action,
        status: r.status,
        created_at: r.created_at,
      }));
      setAuditRows(mapped);
      setProfileEvents(
        mapped.filter((r) => r.action.startsWith("profile_")).slice(0, MAX_EVENTS),
      );
    } catch {
      setAuditRows([]);
      setProfileEvents([]);
    }
  }, [activeProfileId]);

  useEffect(() => {
    void loadLogs();
    void loadAudit();
  }, [loadLogs, loadAudit, runtime.status]);

  if (!activeProfileId) {
    return <p className="workspaces-panel-muted">{t("workspaces.noProfile")}</p>;
  }

  const healthLabel =
    runtime.status !== "running"
      ? "—"
      : runtime.healthy
        ? t("workspaces.runtime.healthOk", { defaultValue: "OK" })
        : t("workspaces.runtime.healthUnhealthy", { defaultValue: "Unhealthy" });

  return (
    <div className="workspaces-panel-root workspaces-panel-padded">
      <dl className="workspaces-dl">
        <div className="workspaces-dl-row">
          <dt>{t("workspaces.runtime.port", { defaultValue: "Port" })}</dt>
          <dd>{runtime.port ?? "—"}</dd>
        </div>
        <div className="workspaces-dl-row">
          <dt>PID</dt>
          <dd>{runtime.pid ?? "—"}</dd>
        </div>
        <div className="workspaces-dl-row">
          <dt>{t("workspaces.runtime.health", { defaultValue: "Health" })}</dt>
          <dd
            className={
              runtime.status === "running" && !runtime.healthy ? "is-warning" : undefined
            }
          >
            {healthLabel}
          </dd>
        </div>
      </dl>
      {runtime.lastError ? (
        <p className="workspaces-runtime-error-text">{runtime.lastError}</p>
      ) : null}
      <div className="workspaces-runtime-actions">
        <button
          type="button"
          className="workspaces-runtime-btn-start"
          disabled={runtime.actionLoading}
          onClick={() => void runtime.start()}
        >
          {t("workspaces.runtime.start", { defaultValue: "Start" })}
        </button>
        <button
          type="button"
          className="workspaces-runtime-btn-default"
          disabled={runtime.actionLoading}
          onClick={() => void runtime.stop()}
        >
          {t("workspaces.runtime.stop", { defaultValue: "Stop" })}
        </button>
        <button
          type="button"
          className="workspaces-runtime-btn-default"
          disabled={runtime.actionLoading}
          onClick={() => void runtime.restart()}
        >
          {t("workspaces.runtime.restart", { defaultValue: "Restart" })}
        </button>
        <button
          type="button"
          className="workspaces-runtime-btn-default"
          onClick={() => {
            void loadLogs();
            void loadAudit();
          }}
        >
          {t("common.refresh", { defaultValue: "Refresh" })}
        </button>
      </div>

      <section className="workspaces-panel-scroll">
        <h4 className="workspaces-panel-section-title">
          {t("workspaces.runtime.events", { defaultValue: "Events" })}
        </h4>
        {profileEvents.length === 0 ? (
          <p className="workspaces-panel-list-item">
            {t("workspaces.runtime.noEvents", { defaultValue: "No recent status changes" })}
          </p>
        ) : (
          <ul className="workspaces-panel-list">
            {profileEvents.map((ev) => (
              <li key={ev.id} className="workspaces-panel-list-item">
                {new Date(ev.created_at).toLocaleString()} · {ev.action} · {ev.status}
              </li>
            ))}
          </ul>
        )}

        <h4 className="workspaces-panel-section-title">
          {t("workspaces.runtime.audit", { defaultValue: "Audit" })}
        </h4>
        {auditRows.length === 0 ? (
          <p className="workspaces-panel-list-item">
            {t("workspaces.runtime.noAudit", { defaultValue: "No audit events" })}
          </p>
        ) : (
          <ul className="workspaces-panel-list">
            {auditRows.map((row) => (
              <li key={row.id} className="workspaces-panel-list-item">
                {new Date(row.created_at).toLocaleString()} · {row.action} · {row.status}
              </li>
            ))}
          </ul>
        )}

        <h4 className="workspaces-panel-section-title">
          {t("workspaces.runtime.logs", { defaultValue: "Logs" })}
        </h4>
        <pre className="workspaces-panel-pre">
          {logs || t("workspaces.runtime.noLogs", { defaultValue: "No logs" })}
        </pre>
      </section>
    </div>
  );
}
