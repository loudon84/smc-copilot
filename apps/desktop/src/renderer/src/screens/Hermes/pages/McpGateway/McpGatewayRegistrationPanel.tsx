import { useTranslation } from "react-i18next";
import type { McpSkillGatewayProfileRegistration } from "../../../../../../shared/mcp-skill-gateway-runtime/mcp-skill-gateway-runtime-contract";

type InfoRowProps = {
  label: string;
  value: React.ReactNode;
};

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="hermes-dl-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function readyBadgeClass(ready: boolean): string {
  return ready ? "hermes-mcp-badge is-ok" : "hermes-mcp-badge is-error";
}

type Props = {
  registrations: McpSkillGatewayProfileRegistration[];
  hermesRestartRequired: boolean;
  actionPending: boolean;
  consistencyReady: boolean;
  onRegister: (profile: string) => void;
  onUnregister: (profile: string) => void;
};

export function McpGatewayRegistrationPanel({
  registrations,
  hermesRestartRequired,
  actionPending,
  consistencyReady,
  onRegister,
  onUnregister,
}: Props) {
  const { t } = useTranslation();
  const yesNo = (value: boolean) =>
    value ? t("workspaces.hermes.mcpGateway.yes") : t("workspaces.hermes.mcpGateway.no");

  return (
    <section className="hermes-mcp-gateway-section">
      <div className="hermes-mcp-gateway-section__head">
        <h3>{t("workspaces.hermes.mcpGateway.registrationSection")}</h3>
      </div>
      {hermesRestartRequired ? (
        <p className="hermes-page__error">{t("workspaces.hermes.mcpGateway.restartBannerHint")}</p>
      ) : null}
      {!consistencyReady ? (
        <p className="hermes-page__error">{t("workspaces.hermes.mcpGateway.mismatchHint")}</p>
      ) : null}
      <InfoRow
        label={t("workspaces.hermes.mcpGateway.hermesRestartRequired")}
        value={yesNo(hermesRestartRequired)}
      />
      <ul className="hermes-mcp-gateway-reg-list">
        {registrations.map((row) => (
          <li key={row.profile} className="hermes-mcp-gateway-reg-card">
            <div className="hermes-mcp-gateway-reg-card__head">
              <strong>{row.profile}</strong>
              <span className={readyBadgeClass(row.ready)}>
                {row.ready
                  ? t("workspaces.hermes.mcpGateway.ready")
                  : t("workspaces.hermes.mcpGateway.notReady")}
              </span>
            </div>
            <InfoRow
              label={t("workspaces.hermes.mcpGateway.registered")}
              value={yesNo(row.registered)}
            />
            <InfoRow label={t("workspaces.hermes.mcpGateway.enabled")} value={yesNo(row.enabled)} />
            <InfoRow label="URL" value={<code>{row.url ?? "—"}</code>} />
            <InfoRow
              label={t("workspaces.hermes.mcpGateway.expectedUrl")}
              value={<code>{row.expectedUrl}</code>}
            />
            <InfoRow
              label={t("workspaces.hermes.mcpGateway.urlMatched")}
              value={yesNo(row.urlMatched)}
            />
            <InfoRow
              label={t("workspaces.hermes.mcpGateway.backendMatched")}
              value={yesNo(row.backendMatched)}
            />
            <p className="hermes-muted hermes-mcp-gateway-reg-card__path">
              <code>{row.configPath}</code>
            </p>
            <div className="hermes-mcp-gateway-reg-card__actions">
              <button
                type="button"
                className="hermes-btn-ghost"
                disabled={actionPending}
                onClick={() => void onRegister(row.profile)}
              >
                {t("workspaces.hermes.mcpGateway.register")}
              </button>
              <button
                type="button"
                className="hermes-btn-ghost"
                disabled={actionPending}
                onClick={() => void onUnregister(row.profile)}
              >
                {t("workspaces.hermes.mcpGateway.unregister")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
