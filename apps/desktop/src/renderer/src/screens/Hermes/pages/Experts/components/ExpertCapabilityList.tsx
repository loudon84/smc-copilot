import { useTranslation } from "react-i18next";
import type { WorkExpertCapabilitySummary } from "../../../model/expert";

type Props = {
  capabilities: WorkExpertCapabilitySummary;
};

export function ExpertCapabilityList({ capabilities }: Props) {
  const { t } = useTranslation();
  return (
    <section className="hermes-expert-capabilities">
      <h3>{t("workspaces.hermes.experts.detail.capabilities")}</h3>
      {capabilities.skills.length > 0 ? (
        <div>
          <h4>{t("workspaces.hermes.experts.detail.skills")}</h4>
          <ul>
            {capabilities.skills.map((s) => (
              <li key={s.skillId}>
                {s.name} v{s.version}
                {s.required ? " *" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {capabilities.mcpServers.length > 0 ? (
        <div>
          <h4>{t("workspaces.hermes.experts.detail.mcp")}</h4>
          <ul>
            {capabilities.mcpServers.map((m) => (
              <li key={m.serverId}>{m.name}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {capabilities.allowedTools.length > 0 ? (
        <div>
          <h4>{t("workspaces.hermes.experts.detail.tools")}</h4>
          <p className="hermes-muted">{capabilities.allowedTools.join(", ")}</p>
        </div>
      ) : null}
    </section>
  );
}
