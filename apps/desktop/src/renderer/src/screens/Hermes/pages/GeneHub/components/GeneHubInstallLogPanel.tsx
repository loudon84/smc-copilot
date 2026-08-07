import { useTranslation } from "react-i18next";
import type { InstallLogEntry } from "../../../../../../../shared/genehub/genehub-contract";

type Props = {
  logs: InstallLogEntry[];
};

export function GeneHubInstallLogPanel({ logs }: Props) {
  const { t } = useTranslation();

  if (logs.length === 0) {
    return <p className="hermes-muted">{t("workspaces.hermes.geneHub.emptyLogs")}</p>;
  }

  return (
    <div className="hermes-genehub-logs">
      <table className="hermes-table">
        <thead>
          <tr>
            <th>{t("workspaces.hermes.geneHub.logTime")}</th>
            <th>{t("workspaces.hermes.geneHub.logSkill")}</th>
            <th>{t("workspaces.hermes.geneHub.logStep")}</th>
            <th>{t("workspaces.hermes.geneHub.logStatus")}</th>
            <th>{t("workspaces.hermes.geneHub.logMessage")}</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((entry, index) => (
            <tr key={`${entry.jobId}-${entry.time}-${index}`}>
              <td>{new Date(entry.time).toLocaleString()}</td>
              <td>{entry.geneSlug}</td>
              <td>{entry.step}</td>
              <td>{entry.status}</td>
              <td>{entry.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
