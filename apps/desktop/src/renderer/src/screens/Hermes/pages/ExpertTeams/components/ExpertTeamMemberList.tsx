import { useTranslation } from "react-i18next";
import type { WorkTeamMember } from "../../../model/expert-team";

type Props = {
  members: WorkTeamMember[];
};

export function ExpertTeamMemberList({ members }: Props) {
  const { t } = useTranslation();
  return (
    <section>
      <h3>{t("workspaces.hermes.expertTeams.members")}</h3>
      <ul className="hermes-team-member-list">
        {members.map((m) => (
          <li key={m.expertId}>
            <strong>{m.roleName}</strong>
            <span>{m.responsibility}</span>
            {m.required ? <em>{t("workspaces.hermes.expertTeams.required")}</em> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
