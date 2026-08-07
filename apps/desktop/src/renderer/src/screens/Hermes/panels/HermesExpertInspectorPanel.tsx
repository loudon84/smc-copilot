import { useTranslation } from "react-i18next";
import { useHermesExpertsCatalog } from "../context/HermesExpertsContext";
import { useHermesWorkspace } from "../context/HermesWorkspaceContext";
import { useExpertRunDetail } from "../features/expert-run/useExpertRunDetail";
import { ExpertRunMemberPanel } from "../pages/ExpertRuns/components/ExpertRunMemberPanel";
import { RunTimeline } from "../pages/ExpertRuns/components/RunTimeline";

type Props = {
  tab: "timeline" | "artifacts" | "members" | "audit" | "toolsMcp";
};

export function HermesExpertInspectorPanel({ tab }: Props) {
  const { t } = useTranslation();
  const workspace = useHermesWorkspace();
  const { getExpertById, getTeamById, refreshExperts } = useHermesExpertsCatalog();
  const { detail } = useExpertRunDetail(workspace.activeRunId ?? null);

  const expert =
    workspace.activeExpertId != null ? getExpertById(workspace.activeExpertId) : undefined;
  const team = workspace.activeTeamId != null ? getTeamById(workspace.activeTeamId) : undefined;

  const handleTrust = () => {
    if (!expert || typeof window.hermesExperts === "undefined") return;
    void window.hermesExperts.setExpertTrust(expert.expertId, "trusted").then(() => {
      void refreshExperts();
    });
  };

  const timeline = detail?.timeline ?? [];
  const toolEvents = timeline.filter(
    (e) => e.eventType === "tool_call" || e.eventType === "mcp_registered",
  );

  if (tab === "toolsMcp") {
    return (
      <div className="hermes-panel-root hermes-panel-padded">
        <h4>{t("workspaces.hermes.inspector.toolsMcp")}</h4>
        {expert ? (
          <>
            <section>
              <h5>{t("workspaces.hermes.experts.detail.skills")}</h5>
              <ul className="hermes-list">
                {expert.capabilities.skills.map((s) => (
                  <li key={s.skillId}>
                    {s.name} v{s.version}
                    {s.required ? " *" : ""}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h5>MCP</h5>
              <ul className="hermes-list">
                {expert.capabilities.mcpServers.map((m) => (
                  <li key={m.serverId}>
                    {m.name} — {m.transport}
                    {m.trustRequired ? ` (${t("workspaces.hermes.experts.trust.untrusted")})` : ""}
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
        {toolEvents.length > 0 ? (
          <section>
            <h5>{t("workspaces.hermes.expertRuns.timeline")}</h5>
            <RunTimeline events={toolEvents} />
          </section>
        ) : (
          <p className="hermes-muted">{t("workspaces.hermes.inspector.toolsMcpEmpty")}</p>
        )}
      </div>
    );
  }

  if (tab === "timeline") {
    return (
      <div className="hermes-panel-root hermes-panel-padded">
        <h4>{t("workspaces.hermes.expertRuns.timeline")}</h4>
        <RunTimeline events={timeline} />
      </div>
    );
  }

  if (tab === "artifacts") {
    const artifacts = detail?.artifacts ?? [];
    return (
      <div className="hermes-panel-root hermes-panel-padded">
        <h4>{t("workspaces.hermes.expertRuns.artifacts")}</h4>
        {artifacts.length === 0 ? (
          <p className="hermes-muted">{t("workspaces.hermes.expertRuns.noArtifacts")}</p>
        ) : (
          <ul className="hermes-list">
            {artifacts.map((a) => (
              <li key={a.id}>
                <strong>{a.name}</strong>
                <span className="hermes-muted"> — {a.type}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (tab === "members") {
    return (
      <div className="hermes-panel-root hermes-panel-padded">
        <h4>{t("workspaces.hermes.expertTeams.members")}</h4>
        {detail?.memberRuns && detail.memberRuns.length > 0 ? (
          <ExpertRunMemberPanel memberRuns={detail.memberRuns} teamEvents={timeline} />
        ) : team ? (
          <ul className="hermes-list">
            <li>
              <strong>{t("workspaces.hermes.expertTeams.leader")}</strong>: {team.leader.roleName}
            </li>
            {team.members.map((m) => (
              <li key={m.expertId}>
                {m.roleName} — {m.responsibility}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hermes-muted">{t("workspaces.hermes.expertRuns.noMembers")}</p>
        )}
      </div>
    );
  }

  return (
    <div className="hermes-panel-root hermes-panel-padded">
      <h4>{t("workspaces.hermes.inspector.audit")}</h4>
      {expert ? (
        <div className="hermes-inspector-section">
          <p>
            {t("workspaces.hermes.experts.trustStatus")}:{" "}
            <span className={`hermes-badge hermes-badge--trust-${expert.trustStatus}`}>
              {t(`workspaces.hermes.experts.trust.${expert.trustStatus}`, {
                defaultValue: expert.trustStatus,
              })}
            </span>
          </p>
          {expert.trustStatus === "untrusted" ? (
            <button type="button" className="hermes-btn-primary" onClick={handleTrust}>
              {t("workspaces.hermes.experts.trustAction")}
            </button>
          ) : null}
          <p className="hermes-muted">{t("workspaces.hermes.inspector.auditHint")}</p>
        </div>
      ) : (
        <p className="hermes-muted">{t("workspaces.hermes.inspector.auditEmpty")}</p>
      )}
    </div>
  );
}
