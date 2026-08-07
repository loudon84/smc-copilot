import { useTranslation } from "react-i18next";
import type { GeneHubConnection } from "../../../../../../../shared/genehub/genehub-contract";

type Props = {
  connection: GeneHubConnection | null;
  actionPending: boolean;
  onProbe: () => void;
  onInitialize: () => void;
  onSync: () => void;
};

function statusBadgeClass(status?: string): string {
  if (status === "connected") return "hermes-badge hermes-badge--running";
  if (status === "unauthorized" || status === "forbidden") return "hermes-badge hermes-badge--error";
  if (status === "offline" || status === "misconfigured" || status === "disabled") {
    return "hermes-badge hermes-badge--stopped";
  }
  return "hermes-badge hermes-badge--starting";
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="hermes-dl-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function GeneHubConnectionCard({
  connection,
  actionPending,
  onProbe,
  onInitialize,
  onSync,
}: Props) {
  const { t } = useTranslation();

  const statusLabelMap: Record<string, string> = {
    connected: t("workspaces.hermes.geneHub.statusConnected"),
    degraded: t("workspaces.hermes.geneHub.statusDegraded"),
    unauthorized: t("workspaces.hermes.geneHub.statusUnauthorized"),
    forbidden: t("workspaces.hermes.geneHub.statusForbidden"),
    offline: t("workspaces.hermes.geneHub.statusOffline"),
    misconfigured: t("workspaces.hermes.geneHub.statusMisconfigured"),
    disabled: t("workspaces.hermes.geneHub.statusDisabled"),
  };

  const yesNo = (value: boolean) =>
    value ? t("workspaces.hermes.geneHub.yes") : t("workspaces.hermes.geneHub.no");

  return (
    <section className="hermes-mcp-gateway-section">
      <h3>{t("workspaces.hermes.geneHub.connectionSection")}</h3>
      <dl className="hermes-dl">
        <InfoRow
          label={t("workspaces.hermes.geneHub.connectionStatus")}
          value={
            <span className={statusBadgeClass(connection?.status)}>
              {statusLabelMap[connection?.status ?? ""] ?? connection?.status ?? "—"}
            </span>
          }
        />
        <InfoRow label={t("workspaces.hermes.geneHub.backendUrl")} value={connection?.backendBaseUrl || "—"} />
        <InfoRow label={t("workspaces.hermes.geneHub.apiBaseUrl")} value={connection?.apiBaseUrl || "—"} />
        <InfoRow
          label={t("workspaces.hermes.geneHub.registryName")}
          value={connection?.descriptor?.name ?? "—"}
        />
        <InfoRow label={t("workspaces.hermes.geneHub.loggedIn")} value={yesNo(Boolean(connection?.loggedIn))} />
        <InfoRow
          label={t("workspaces.hermes.geneHub.memberVerified")}
          value={yesNo(Boolean(connection?.memberVerified))}
        />
        <InfoRow label={t("workspaces.hermes.geneHub.health")} value={connection?.healthDetail ?? "—"} />
        <InfoRow label={t("workspaces.hermes.geneHub.initialized")} value={yesNo(Boolean(connection?.initialized))} />
        {connection?.lastError ? (
          <InfoRow label={t("workspaces.hermes.geneHub.lastError")} value={connection.lastError} />
        ) : null}
      </dl>
      <div className="hermes-mcp-gateway-section__actions">
        <button type="button" className="hermes-btn-ghost" disabled={actionPending} onClick={onProbe}>
          {t("workspaces.hermes.geneHub.probeConnection")}
        </button>
        <button type="button" className="hermes-btn-ghost" disabled={actionPending} onClick={onInitialize}>
          {t("workspaces.hermes.geneHub.initialize")}
        </button>
        <button type="button" className="hermes-btn-ghost" disabled={actionPending} onClick={onSync}>
          {t("workspaces.hermes.geneHub.resync")}
        </button>
      </div>
    </section>
  );
}
