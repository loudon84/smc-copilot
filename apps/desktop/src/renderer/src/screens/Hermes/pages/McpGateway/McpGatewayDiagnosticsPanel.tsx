import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { McpGatewayDiagnosticsResult } from "../../../../../../shared/mcp-skill-gateway-runtime/mcp-gateway-operations-contract";

type Props = {
  result: McpGatewayDiagnosticsResult | null;
  pending: boolean;
  onRun: () => void;
  onCopyReport?: () => void;
};

function stepIcon(ok: boolean): string {
  return ok ? "✓" : "✗";
}

export function McpGatewayDiagnosticsPanel({ result, pending, onRun, onCopyReport }: Props) {
  const { t } = useTranslation();

  const handleCopy = useCallback(() => {
    if (onCopyReport) {
      onCopyReport();
      return;
    }
    if (!result) return;
    void navigator.clipboard.writeText(JSON.stringify(result, null, 2));
  }, [onCopyReport, result]);

  return (
    <section className="hermes-mcp-gateway-section">
      <div className="hermes-mcp-gateway-section__head">
        <h3>{t("workspaces.hermes.mcpGateway.diagnosticsTitle")}</h3>
        <div className="hermes-mcp-gateway-section__actions">
          {result ? (
            <button type="button" className="hermes-btn-ghost" onClick={() => void handleCopy()}>
              {t("workspaces.hermes.mcpGateway.diagnosticsCopyReport")}
            </button>
          ) : null}
          <button
            type="button"
            className="hermes-btn-primary"
            disabled={pending}
            onClick={() => void onRun()}
          >
            {pending
              ? t("workspaces.hermes.mcpGateway.diagnosticsRunning")
              : t("workspaces.hermes.mcpGateway.diagnosticsRun")}
          </button>
        </div>
      </div>
      <p className="hermes-muted">{t("workspaces.hermes.mcpGateway.diagnosticsHint")}</p>

      {result ? (
        <>
          <p className="hermes-muted">
            {t("workspaces.hermes.mcpGateway.diagnosticsCheckedAt")}:{" "}
            {new Date(result.checkedAt).toLocaleString()}
          </p>
          <p className={result.ok ? "hermes-muted" : "hermes-page__error"}>
            {result.ok
              ? t("workspaces.hermes.mcpGateway.diagnosticsOk")
              : t("workspaces.hermes.mcpGateway.diagnosticsFailed")}
          </p>
          <ul className="hermes-mcp-gateway-diag-list">
            {result.steps.map((row) => (
              <li key={row.step} className="hermes-mcp-gateway-diag-row">
                <span className={row.ok ? "hermes-mcp-diag-ok" : "hermes-mcp-diag-fail"}>
                  {stepIcon(row.ok)}
                </span>
                <span>{row.label}</span>
                {row.detail ? <span className="hermes-muted">{row.detail}</span> : null}
                {row.error ? <code className="hermes-page__error">{row.error}</code> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

/** @deprecated use McpGatewayDiagnosticsPanel */
export const McpGatewayDiagnosticsSection = McpGatewayDiagnosticsPanel;
