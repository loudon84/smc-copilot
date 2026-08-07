import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HermesReadinessCheckResult } from "../../../../../../shared/hermes-client/hermes-client-contract";

type Props = {
  open: boolean;
  pending: boolean;
  result: HermesReadinessCheckResult | null;
  initialAgentAlias?: string;
  onClose: () => void;
  onRun: (input: {
    agentAlias: string;
    toolName?: string;
    profileName?: string;
    workspaceId?: string;
  }) => void;
  onOpenSkillCenter?: () => void;
};

const CHECK_KEYS = [
  "user_authenticated",
  "org_member",
  "desktop_context",
  "agent_exists",
  "agent_enabled",
  "agent_healthy",
  "profile_root_path_exists",
  "workspace_root_path_exists",
  "skill_exists",
  "skill_active",
  "skill_mcp_exposed",
  "installation_installed",
  "user_can_list",
  "user_can_invoke",
  "queue_accepting",
] as const;

export function McpGatewayReadinessDrawer({
  open,
  pending,
  result,
  initialAgentAlias = "common-writer",
  onClose,
  onRun,
  onOpenSkillCenter,
}: Props) {
  const { t } = useTranslation();
  const [agentAlias, setAgentAlias] = useState(initialAgentAlias);
  const [toolName, setToolName] = useState("");
  const [profileName, setProfileName] = useState("default");
  const [workspaceId, setWorkspaceId] = useState("");

  useEffect(() => {
    if (open) setAgentAlias(initialAgentAlias);
  }, [open, initialAgentAlias]);

  if (!open) return null;

  const showSkillCenterHint =
    result && result.checks.skill_exists === false && onOpenSkillCenter;

  return (
    <div className="hermes-mcp-gateway-drawer" role="dialog">
      <div className="hermes-mcp-gateway-drawer__panel">
        <div className="hermes-mcp-gateway-section__head">
          <h3>{t("workspaces.hermes.mcpGateway.readinessTitle")}</h3>
          <button type="button" className="hermes-btn-ghost" onClick={onClose}>
            {t("workspaces.hermes.mcpGateway.readinessClose")}
          </button>
        </div>
        <label className="hermes-mcp-gateway-field">
          <span>{t("workspaces.hermes.mcpGateway.readinessAgentAlias")}</span>
          <input
            className="hermes-input"
            value={agentAlias}
            onChange={(e) => setAgentAlias(e.target.value)}
          />
        </label>
        <label className="hermes-mcp-gateway-field">
          <span>{t("workspaces.hermes.mcpGateway.readinessToolName")}</span>
          <input
            className="hermes-input"
            value={toolName}
            onChange={(e) => setToolName(e.target.value)}
          />
        </label>
        <label className="hermes-mcp-gateway-field">
          <span>{t("workspaces.hermes.mcpGateway.readinessProfile")}</span>
          <input
            className="hermes-input"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
          />
        </label>
        <label className="hermes-mcp-gateway-field">
          <span>{t("workspaces.hermes.mcpGateway.readinessWorkspace")}</span>
          <input
            className="hermes-input"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="hermes-btn-primary"
          disabled={pending}
          onClick={() =>
            onRun({
              agentAlias: agentAlias.trim(),
              toolName: toolName.trim() || undefined,
              profileName: profileName.trim() || undefined,
              workspaceId: workspaceId.trim() || undefined,
            })
          }
        >
          {pending
            ? t("workspaces.hermes.mcpGateway.readinessRunning")
            : t("workspaces.hermes.mcpGateway.readinessRun")}
        </button>
        {result ? (
          <>
            <p className={result.ready ? "hermes-muted" : "hermes-page__error"}>
              {result.ready
                ? t("workspaces.hermes.mcpGateway.readinessReady")
                : t("workspaces.hermes.mcpGateway.readinessNotReady")}
              {result.routing?.reason ? ` — ${result.routing.reason}` : ""}
            </p>
            <ul className="hermes-mcp-gateway-diag-list">
              {CHECK_KEYS.map((key) => (
                <li key={key} className="hermes-mcp-gateway-diag-row">
                  <span className={result.checks[key] ? "hermes-mcp-diag-ok" : "hermes-mcp-diag-fail"}>
                    {result.checks[key] ? "✓" : "✗"}
                  </span>
                  <span>{key}</span>
                </li>
              ))}
            </ul>
            {result.errors.length > 0 ? (
              <ul className="hermes-mcp-gateway-diag-list">
                {result.errors.map((err) => (
                  <li key={`${err.code}-${err.message}`}>
                    <code>
                      {err.code}: {err.message}
                    </code>
                  </li>
                ))}
              </ul>
            ) : null}
            {showSkillCenterHint ? (
              <button type="button" className="hermes-btn-ghost" onClick={onOpenSkillCenter}>
                {t("workspaces.hermes.mcpGateway.readinessOpenSkillCenter")}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
