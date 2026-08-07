import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  McpGatewayInvokeTestResult,
  McpGatewayToolPreview,
} from "../../../../../../shared/mcp-skill-gateway-runtime/mcp-gateway-operations-contract";

type Props = {
  tools: McpGatewayToolPreview[];
  pending: boolean;
  result: McpGatewayInvokeTestResult | null;
  onRun: (toolName: string, argsJson: string) => void;
};

export function McpGatewayInvokeTestPanel({ tools, pending, result, onRun }: Props) {
  const { t } = useTranslation();
  const readTools = useMemo(
    () => tools.filter((tool) => tool.permission === "read"),
    [tools],
  );
  const [toolName, setToolName] = useState("hermes.skills.list");
  const [argsJson, setArgsJson] = useState('{\n  "instance_ref": "zhang-zhen"\n}');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleRun = () => {
    setJsonError(null);
    const trimmed = argsJson.trim();
    if (!trimmed) {
      onRun(toolName.trim(), "{}");
      return;
    }
    try {
      JSON.parse(trimmed);
      onRun(toolName.trim(), trimmed);
    } catch {
      setJsonError(t("workspaces.hermes.mcpGateway.invokeTestJsonInvalid"));
    }
  };

  return (
    <section className="hermes-mcp-gateway-section">
      <h3>{t("workspaces.hermes.mcpGateway.invokeTestTitle")}</h3>
      <p className="hermes-muted">{t("workspaces.hermes.mcpGateway.invokeTestHint")}</p>
      <label className="hermes-mcp-gateway-field">
        <span>{t("workspaces.hermes.mcpGateway.invokeTestToolName")}</span>
        {readTools.length > 0 ? (
          <select
            className="hermes-input"
            value={toolName}
            onChange={(e) => setToolName(e.target.value)}
          >
            {readTools.map((tool) => (
              <option key={tool.name} value={tool.name}>
                {tool.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            className="hermes-input"
            value={toolName}
            onChange={(e) => setToolName(e.target.value)}
          />
        )}
      </label>
      <label className="hermes-mcp-gateway-field">
        <span>{t("workspaces.hermes.mcpGateway.invokeTestArguments")}</span>
        <textarea
          className="hermes-input hermes-mcp-gateway-json-input"
          rows={6}
          value={argsJson}
          onChange={(e) => setArgsJson(e.target.value)}
          spellCheck={false}
        />
      </label>
      {jsonError ? <p className="hermes-page__error">{jsonError}</p> : null}
      <div className="hermes-mcp-gateway-section__actions">
        <button
          type="button"
          className="hermes-btn-primary"
          disabled={pending || !toolName.trim()}
          onClick={() => void handleRun()}
        >
          {t("workspaces.hermes.mcpGateway.invokeTestRun")}
        </button>
      </div>
      {result ? (
        <>
          <p className={result.ok ? "hermes-muted" : "hermes-page__error"}>
            {result.ok
              ? t("workspaces.hermes.mcpGateway.invokeTestOk", { ms: result.durationMs })
              : t("workspaces.hermes.mcpGateway.invokeTestFailed", {
                  code: result.errorCode ?? "unknown",
                  message: result.errorMessage ?? "",
                })}
          </p>
          {result.resultTruncated ? (
            <p className="hermes-page__error">
              {t("workspaces.hermes.mcpGateway.invokeTestResultTruncated")}
            </p>
          ) : null}
          {result.approvalRequired ? (
            <p className="hermes-page__error">
              {t("workspaces.hermes.mcpGateway.invokeTestApprovalRequired")}
              {result.approvalRequestId ? (
                <span>
                  {" "}
                  <code>{result.approvalRequestId}</code>
                </span>
              ) : null}
            </p>
          ) : null}
          {result.grantStatus === "revoked" ? (
            <p className="hermes-page__error">
              {t("workspaces.hermes.mcpGateway.invokeTestGrantRevoked")}
            </p>
          ) : null}
          {result.result != null ? (
            <pre className="hermes-panel-pre hermes-mcp-gateway-logs">
              {JSON.stringify(result.result, null, 2)}
            </pre>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/** @deprecated use McpGatewayInvokeTestPanel */
export const McpGatewayInvokeTestSection = McpGatewayInvokeTestPanel;
