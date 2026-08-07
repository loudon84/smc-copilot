import { useCallback, useEffect, useState } from "react";
import type { AuditEventRecord } from "../../../../../shared/profile-runtime/profile-runtime-contract";
import type { GatewayLogEntry } from "../../../../../shared/profile-runtime/profile-runtime-contract";
import type { CopilotServeHttpConfig } from "../../../lib/copilot-serve/http-client";
import {
  getServeGatewayLogs,
  listServeProfileEvents,
} from "../../../lib/copilot-serve/profile-client";
import { useI18n } from "../../../components/useI18n";

export interface ProfileLogViewerProps {
  profileId: string | null;
  httpConfig: CopilotServeHttpConfig | null;
}

function formatAuditLine(e: AuditEventRecord): string {
  const scope = e.profile_id ? "" : "[global] ";
  const err = e.error_message ? ` — ${e.error_message}` : "";
  return `${e.created_at} ${scope}${e.event_type}/${e.action} ${e.status}${err}`;
}

export function ProfileLogViewer({
  profileId,
  httpConfig,
}: ProfileLogViewerProps): React.JSX.Element {
  const { t } = useI18n();
  const [gatewayLogs, setGatewayLogs] = useState<GatewayLogEntry[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventRecord[]>([]);
  const [roleSyncEvents, setRoleSyncEvents] = useState<AuditEventRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const roleLibraryAudits = await window.profileRuntime.listAuditEvents({
        eventType: "profile_role",
        limit: 30,
      });
      const syncOnly = roleLibraryAudits.filter((e) => e.action === "sync_role_library");
      setRoleSyncEvents(syncOnly);

      if (!profileId || !httpConfig) {
        setGatewayLogs([]);
        setAuditEvents([]);
        return;
      }

      const [logs, audits] = await Promise.all([
        getServeGatewayLogs(httpConfig, profileId, 80),
        listServeProfileEvents(httpConfig, profileId, 40),
      ]);
      setGatewayLogs(logs);
      setAuditEvents(audits);
    } catch {
      setGatewayLogs([]);
      setAuditEvents([]);
      setRoleSyncEvents([]);
    } finally {
      setLoading(false);
    }
  }, [profileId, httpConfig]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <section className="settings-drawer-section">
      <div className="settings-drawer-log-header">
        <h3 className="settings-drawer-section-title">
          {t("runtimeSettings.multiProfilesLogsTitle")}
        </h3>
        <button
          type="button"
          className="settings-drawer-link-btn"
          disabled={loading || !httpConfig}
          onClick={() => void loadLogs()}
        >
          {t("runtimeSettings.multiProfilesRefreshLogs")}
        </button>
      </div>

      <p className="settings-drawer-log-label">
        {t("runtimeSettings.multiProfilesRoleSyncLogs")}
      </p>
      <pre className="settings-drawer-log-pre">
        {roleSyncEvents.length === 0
          ? t("runtimeSettings.multiProfilesLogsEmpty")
          : roleSyncEvents.map(formatAuditLine).join("\n")}
      </pre>

      {!profileId ? (
        <p className="settings-drawer-text-muted">{t("runtimeSettings.multiProfilesSelectProfile")}</p>
      ) : !httpConfig ? (
        <p className="settings-drawer-text-muted">{t("runtimeSettings.multiProfilesServeUnavailable")}</p>
      ) : (
        <>
          <p className="settings-drawer-log-label">
            {t("runtimeSettings.multiProfilesGatewayLogs")}
          </p>
          <pre className="settings-drawer-log-pre is-tall">
            {gatewayLogs.length === 0
              ? t("runtimeSettings.multiProfilesLogsEmpty")
              : gatewayLogs.map((l) => `[${l.level}] ${l.message}`).join("\n")}
          </pre>
          <p className="settings-drawer-log-label">
            {t("runtimeSettings.multiProfilesAuditLogs")}
          </p>
          <pre className="settings-drawer-log-pre is-tall">
            {auditEvents.length === 0
              ? t("runtimeSettings.multiProfilesLogsEmpty")
              : auditEvents.map(formatAuditLine).join("\n")}
          </pre>
        </>
      )}
    </section>
  );
}
