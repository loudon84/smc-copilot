import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HermesClientTool } from "../../../../../../shared/hermes-client/hermes-client-contract";
import type {
  McpGatewayToolCategory,
  McpGatewayToolPreview,
} from "../../../../../../shared/mcp-skill-gateway-runtime/mcp-gateway-operations-contract";
import {
  grantStatusBadgeClass,
  grantStatusLabel,
  toolAuthorizationHint,
} from "./mcp-gateway-authorization-ui";

type Props = {
  tools: McpGatewayToolPreview[];
  clientTools?: HermesClientTool[];
  useClientTools?: boolean;
  agentAliases?: string[];
  loading: boolean;
  lastSyncAt?: string | null;
  onRefresh: () => void;
  onFilterChange?: (input: {
    agentAlias?: string;
    profileName?: string;
    keyword?: string;
  }) => void;
};

const CATEGORY_ORDER: McpGatewayToolCategory[] = ["hermes", "genehub", "system", "unknown"];

function categoryLabel(category: McpGatewayToolCategory, t: (key: string) => string): string {
  const key = `workspaces.hermes.mcpGateway.category.${category}`;
  return t(key);
}

function permissionLabel(permission: string, t: (key: string) => string): string {
  return t(`workspaces.hermes.mcpGateway.permission.${permission}`);
}

function riskLabel(risk: string, t: (key: string) => string): string {
  return t(`workspaces.hermes.mcpGateway.riskLevel.${risk}`);
}

export function McpGatewayToolsPreview({
  tools,
  clientTools = [],
  useClientTools = false,
  agentAliases = [],
  loading,
  lastSyncAt,
  onRefresh,
  onFilterChange,
}: Props) {
  const { t } = useTranslation();
  const [expandedSchema, setExpandedSchema] = useState<string | null>(null);
  const [agentAlias, setAgentAlias] = useState("");
  const [profileName, setProfileName] = useState("default");
  const [keyword, setKeyword] = useState("");

  const grouped = useMemo(() => {
    const map = new Map<McpGatewayToolCategory, McpGatewayToolPreview[]>();
    for (const cat of CATEGORY_ORDER) {
      map.set(cat, []);
    }
    for (const tool of tools) {
      const list = map.get(tool.category) ?? [];
      list.push(tool);
      map.set(tool.category, list);
    }
    return CATEGORY_ORDER.map((cat) => ({ category: cat, tools: map.get(cat) ?? [] })).filter(
      (g) => g.tools.length > 0,
    );
  }, [tools]);

  const filteredClientTools = useMemo(() => {
    if (!useClientTools) return clientTools;
    return clientTools.filter((tool) => {
      if (keyword.trim()) {
        const q = keyword.trim().toLowerCase();
        const hay = `${tool.name} ${tool.title ?? ""} ${tool.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [clientTools, keyword, useClientTools]);

  return (
    <section className="hermes-mcp-gateway-section">
      <div className="hermes-mcp-gateway-section__head">
        <h3>{t("workspaces.hermes.mcpGateway.toolsPreviewTitle")}</h3>
        <button
          type="button"
          className="hermes-btn-ghost"
          disabled={loading}
          onClick={() => void onRefresh()}
        >
          {t("workspaces.hermes.common.refresh")}
        </button>
      </div>
      {useClientTools ? (
        <div className="hermes-mcp-gateway-grid">
          <label className="hermes-mcp-gateway-field">
            <span>{t("workspaces.hermes.mcpGateway.toolsFilterAgent")}</span>
            <select
              className="hermes-input"
              value={agentAlias}
              onChange={(e) => {
                setAgentAlias(e.target.value);
                onFilterChange?.({
                  agentAlias: e.target.value || undefined,
                  profileName: profileName || undefined,
                  keyword: keyword || undefined,
                });
              }}
            >
              <option value="">{t("workspaces.hermes.mcpGateway.toolsFilterAllAgents")}</option>
              {agentAliases.map((alias) => (
                <option key={alias} value={alias}>
                  {alias}
                </option>
              ))}
            </select>
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
            <span>{t("workspaces.hermes.mcpGateway.toolsFilterKeyword")}</span>
            <input
              className="hermes-input"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="hermes-btn-ghost"
            onClick={() =>
              onFilterChange?.({
                agentAlias: agentAlias || undefined,
                profileName: profileName || undefined,
                keyword: keyword || undefined,
              })
            }
          >
            {t("workspaces.hermes.mcpGateway.toolsFilterApply")}
          </button>
        </div>
      ) : null}
      {lastSyncAt ? (
        <p className="hermes-muted">
          {t("workspaces.hermes.mcpGateway.toolsPreviewLastSync")}:{" "}
          {new Date(lastSyncAt).toLocaleString()}
        </p>
      ) : null}
      {loading ? <p className="hermes-muted">{t("workspaces.hermes.common.loading")}</p> : null}

      {useClientTools ? (
        <>
          {!loading && filteredClientTools.length === 0 ? (
            <p className="hermes-muted">{t("workspaces.hermes.mcpGateway.toolsPreviewEmpty")}</p>
          ) : null}
          <ul className="hermes-mcp-gateway-tools-list">
            {filteredClientTools.map((tool) => (
              <li key={tool.name} className="hermes-mcp-gateway-tool-card">
                <div className="hermes-mcp-gateway-tool-card__head">
                  <strong>{tool.title ?? tool.name}</strong>
                  {tool.agentAlias ? (
                    <span className="hermes-mcp-badge">{tool.agentAlias}</span>
                  ) : null}
                  {tool.grantStatus ? (
                    <span className="hermes-mcp-badge">{tool.grantStatus}</span>
                  ) : null}
                </div>
                <p className="hermes-muted">
                  <code>{tool.name}</code>
                  {tool.approvalMode ? ` · ${tool.approvalMode}` : ""}
                  {tool.authorized === false
                    ? ` · ${t("workspaces.hermes.mcpGateway.toolNotAuthorized")}`
                    : ""}
                </p>
                {tool.description ? <p className="hermes-muted">{tool.description}</p> : null}
                {tool.uiSchema && Object.keys(tool.uiSchema).length > 0 ? (
                  <pre className="hermes-panel-pre">{JSON.stringify(tool.uiSchema, null, 2)}</pre>
                ) : null}
                {tool.examples && tool.examples.length > 0 ? (
                  <pre className="hermes-panel-pre">{JSON.stringify(tool.examples, null, 2)}</pre>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          {!loading && tools.length === 0 ? (
            <p className="hermes-muted">{t("workspaces.hermes.mcpGateway.toolsPreviewEmpty")}</p>
          ) : null}
          {grouped.map(({ category, tools: catTools }) => (
            <div key={category} className="hermes-mcp-gateway-tools-group">
              <h4>{categoryLabel(category, t)}</h4>
              <ul className="hermes-mcp-gateway-tools-list">
                {catTools.map((tool) => (
                  <li key={tool.name} className="hermes-mcp-gateway-tool-card">
                    <div className="hermes-mcp-gateway-tool-card__head">
                      <strong>{tool.name}</strong>
                      <span className="hermes-mcp-badge">{permissionLabel(tool.permission, t)}</span>
                      <span className="hermes-mcp-badge">{riskLabel(tool.riskLevel, t)}</span>
                      <span className={grantStatusBadgeClass(tool.grantStatus)}>
                        {grantStatusLabel(tool, t)}
                      </span>
                    </div>
                    {tool.description ? <p className="hermes-muted">{tool.description}</p> : null}
                    {toolAuthorizationHint(tool, t) ? (
                      <p className="hermes-page__error">{toolAuthorizationHint(tool, t)}</p>
                    ) : null}
                    {tool.permission !== "read" && tool.requiresApproval ? (
                      <p className="hermes-muted">
                        {tool.grantStatus === "active" || tool.authorized
                          ? t("workspaces.hermes.mcpGateway.toolAuthorized")
                          : t("workspaces.hermes.mcpGateway.toolApprovalRequired")}
                      </p>
                    ) : null}
                    {Object.keys(tool.inputSchema).length > 0 ? (
                      <>
                        <button
                          type="button"
                          className="hermes-btn-ghost"
                          onClick={() =>
                            setExpandedSchema((prev) => (prev === tool.name ? null : tool.name))
                          }
                        >
                          {expandedSchema === tool.name
                            ? t("workspaces.hermes.mcpGateway.inputSchemaHide")
                            : t("workspaces.hermes.mcpGateway.inputSchemaShow")}
                        </button>
                        {expandedSchema === tool.name ? (
                          <pre className="hermes-panel-pre">
                            {JSON.stringify(tool.inputSchema, null, 2)}
                          </pre>
                        ) : null}
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

/** @deprecated use McpGatewayToolsPreview */
export const McpGatewayToolsPreviewSection = McpGatewayToolsPreview;
