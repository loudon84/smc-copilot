import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { McpServer, McpToolSyncResult } from "../../../../../../../shared/mcp/mcp-contract";
import { HERMES_DEFAULT_PROFILE } from "../../../constants";

type Props = {
  servers: McpServer[];
  onRefresh: () => void;
};

function statusClass(status: McpServer["status"]): string {
  if (status === "connected") return "is-ok";
  if (status === "disabled") return "is-muted";
  return "is-error";
}

export function McpServersTab({ servers, onRefresh }: Props) {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = servers.filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setMessage(null);
    try {
      const result = await fn();
      if (result && typeof result === "object" && "ok" in result) {
        const sync = result as McpToolSyncResult;
        if (sync.ok) {
          setMessage(
            t("workspaces.hermes.mcp.syncSuccess", {
              count: sync.toolsCount,
              status: sync.status ?? "connected",
            }),
          );
        } else {
          setMessage(
            t("workspaces.hermes.mcp.syncFailed", {
              code: sync.error?.code ?? "unknown",
              message: sync.error?.message ?? "",
            }),
          );
        }
      }
      onRefresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="hermes-mcp-tab">
      <div className="hermes-mcp-tab__toolbar">
        <input
          className="hermes-input"
          placeholder={t("workspaces.hermes.mcp.searchServers")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="hermes-btn-ghost" onClick={onRefresh}>
          {t("workspaces.hermes.common.refresh")}
        </button>
      </div>
      {message ? <p className="hermes-page__error">{message}</p> : null}
      {filtered.length === 0 ? (
        <p className="hermes-muted">{t("workspaces.hermes.mcp.emptyServers")}</p>
      ) : (
        <ul className="hermes-mcp-server-list">
          {filtered.map((server) => (
            <li key={server.id} className="hermes-mcp-server-card">
              <div className="hermes-mcp-server-card__head">
                <strong>{server.name}</strong>
                <span className={`hermes-mcp-badge ${statusClass(server.status)}`}>
                  {server.status}
                </span>
              </div>
              <p className="hermes-muted">{server.description ?? server.transport}</p>
              <div className="hermes-mcp-server-card__meta">
                <span>{server.transport}</span>
                <span>{t("workspaces.hermes.mcp.toolsCount", { count: server.toolsCount })}</span>
              </div>
              <div className="hermes-mcp-server-card__actions">
                <label className="hermes-mcp-switch">
                  <input
                    type="checkbox"
                    checked={server.enabled}
                    disabled={busyId === server.id}
                    onChange={(e) =>
                      void run(server.id, () =>
                        window.hermesAPI.mcp.setServerEnabled(server.id, e.target.checked),
                      )
                    }
                  />
                  {t("workspaces.hermes.mcp.enabled")}
                </label>
                <button
                  type="button"
                  className="hermes-btn-ghost"
                  disabled={busyId === server.id}
                  onClick={() =>
                    void run(server.id, () => window.hermesAPI.mcp.testConnection(server.id))
                  }
                >
                  {t("workspaces.hermes.mcp.testConnection")}
                </button>
                <button
                  type="button"
                  className="hermes-btn-primary"
                  disabled={busyId === server.id || !server.enabled}
                  onClick={() => void run(server.id, () => window.hermesAPI.mcp.syncTools(server.id))}
                >
                  {t("workspaces.hermes.mcp.syncTools")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type SkillsProps = {
  profile?: string;
};

export function McpSkillsTab({ profile = HERMES_DEFAULT_PROFILE }: SkillsProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [tools, setTools] = useState<Awaited<ReturnType<typeof window.hermesAPI.mcp.listTools>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<(typeof tools)[number] | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await window.hermesAPI.mcp.listTools({
        profile,
        source: "mcp",
        search: search.trim() || undefined,
      });
      setTools(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [search, profile]);

  return (
    <div className="hermes-mcp-tab">
      <div className="hermes-mcp-tab__toolbar">
        <input
          className="hermes-input"
          placeholder={t("workspaces.hermes.mcp.searchSkills")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void refresh();
          }}
        />
        <button type="button" className="hermes-btn-ghost" onClick={() => void refresh()}>
          {t("workspaces.hermes.common.refresh")}
        </button>
      </div>
      {error ? <p className="hermes-page__error">{error}</p> : null}
      {loading ? (
        <p className="hermes-muted">{t("workspaces.hermes.common.loading")}</p>
      ) : tools.length === 0 ? (
        <p className="hermes-muted">{t("workspaces.hermes.mcp.emptySkills")}</p>
      ) : (
        <ul className="hermes-mcp-skill-list">
          {tools.map((tool) => (
            <li key={tool.id} className="hermes-mcp-skill-card">
              <button type="button" className="hermes-mcp-skill-card__title" onClick={() => setSelectedTool(tool)}>
                <strong>{tool.title ?? tool.toolName}</strong>
                <span className="hermes-muted">{tool.serverName}</span>
              </button>
              <p className="hermes-muted">{tool.description ?? tool.toolName}</p>
              <label className="hermes-mcp-switch">
                <input
                  type="checkbox"
                  checked={tool.enabled}
                  disabled={busyId === tool.id}
                  onChange={(e) => {
                    setBusyId(tool.id);
                    void window.hermesAPI.mcp
                      .setToolEnabled({
                        profileName: profile,
                        toolId: tool.id,
                        enabled: e.target.checked,
                      })
                      .then(() => refresh())
                      .finally(() => setBusyId(null));
                  }}
                />
                {t("workspaces.hermes.mcp.enabled")}
              </label>
              <button
                type="button"
                className="hermes-btn-ghost"
                disabled={!tool.enabled || busyId === tool.id}
                onClick={() => {
                  setBusyId(tool.id);
                  setTestResult(null);
                  void window.hermesAPI.mcp
                    .invokeToolTest({
                      profileName: profile,
                      toolId: tool.id,
                      arguments: {},
                    })
                    .then((res) => setTestResult(JSON.stringify(res, null, 2)))
                    .catch((err) => setTestResult(err instanceof Error ? err.message : String(err)))
                    .finally(() => setBusyId(null));
                }}
              >
                {t("workspaces.hermes.mcp.testInvoke")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selectedTool ? (
        <aside className="hermes-mcp-schema-panel">
          <h4>{t("workspaces.hermes.mcp.inputSchema")}</h4>
          <pre>{JSON.stringify(selectedTool.inputSchema ?? {}, null, 2)}</pre>
        </aside>
      ) : null}
      {testResult ? (
        <aside className="hermes-mcp-schema-panel">
          <h4>{t("workspaces.hermes.mcp.lastInvocation")}</h4>
          <pre>{testResult}</pre>
        </aside>
      ) : null}
    </div>
  );
}

export function McpMarketTab() {
  const { t } = useTranslation();
  return (
    <div className="hermes-mcp-tab hermes-mcp-empty">
      <h3>{t("workspaces.hermes.mcp.marketTitle")}</h3>
      <p className="hermes-muted">{t("workspaces.hermes.mcp.marketEmpty")}</p>
    </div>
  );
}
