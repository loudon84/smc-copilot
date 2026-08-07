import { useTranslation } from "react-i18next";
import type { WorkExpert } from "../../../model/expert";
import type { WorkExpertSkill } from "../../../model/expert";
import { ExpertCapabilityList } from "./ExpertCapabilityList";
import { ExpertStarterPrompts } from "./ExpertStarterPrompts";

type Props = {
  expert: WorkExpert | null;
  skills: WorkExpertSkill[];
  open: boolean;
  onClose: () => void;
  onSummon: (expert: WorkExpert) => void;
};

export function ExpertDetailDrawer({ expert, skills, open, onClose, onSummon }: Props) {
  const { t } = useTranslation();

  if (!open || !expert) return null;

  return (
    <div className="hermes-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="hermes-drawer hermes-expert-drawer"
        role="dialog"
        aria-label={expert.displayName}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="hermes-drawer__header">
          <h2>{expert.displayName}</h2>
          <button type="button" className="hermes-icon-button" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="hermes-drawer__body">
          <p>{expert.description}</p>
          {expert.slug ? (
            <section>
              <h3>{t("workspaces.hermes.experts.expertSlug", { defaultValue: "Expert slug" })}</h3>
              <code>{expert.slug}</code>
              {expert.publicSkillCount != null ? (
                <p className="hermes-muted">
                  {t("workspaces.hermes.experts.publicSkills", {
                    defaultValue: "Public skills: {{count}}",
                    count: expert.publicSkillCount,
                  })}
                </p>
              ) : null}
              {expert.skillCount != null ? (
                <p className="hermes-muted">
                  {t("workspaces.hermes.experts.callableSkills", {
                    defaultValue: "{{count}} callable",
                    count: expert.skillCount,
                  })}
                </p>
              ) : null}
            </section>
          ) : null}
          {skills.length > 0 ? (
            <section>
              <h3>{t("workspaces.hermes.experts.skillName", { defaultValue: "Skills" })}</h3>
              <ul className="hermes-expert-skills-list">
                {skills.map((s) => (
                  <li key={s.name}>
                    <strong>{s.displayName}</strong>
                    {s.riskLevel ? <span className="hermes-badge">{s.riskLevel}</span> : null}
                    {s.description ? <p className="hermes-muted">{s.description}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {expert.riskLevel ? (
            <section>
              <h3>{t("workspaces.hermes.experts.riskLevel", { defaultValue: "Risk level" })}</h3>
              <p>{expert.riskLevel}</p>
            </section>
          ) : null}
          {expert.approvalMode ? (
            <section>
              <h3>{t("workspaces.hermes.experts.approvalMode", { defaultValue: "Approval" })}</h3>
              <p>{expert.approvalMode}</p>
            </section>
          ) : null}
          {expert.outputFormats?.length ? (
            <section>
              <h3>{t("workspaces.hermes.experts.outputFormats", { defaultValue: "Output formats" })}</h3>
              <p>{expert.outputFormats.join(", ")}</p>
            </section>
          ) : null}
          {expert.roleName ? (
            <section>
              <h3>{t("workspaces.hermes.experts.detail.role")}</h3>
              <p>{expert.roleName}</p>
            </section>
          ) : null}
          {expert.capabilities ? <ExpertCapabilityList capabilities={expert.capabilities} /> : null}
          <ExpertStarterPrompts
            prompts={expert.starterPrompts}
            onSelect={() => onSummon(expert)}
          />
        </div>
        <footer className="hermes-drawer__footer">
          <button type="button" className="hermes-btn-primary" onClick={() => onSummon(expert)}>
            {t("workspaces.hermes.experts.summon")}
          </button>
        </footer>
      </aside>
    </div>
  );
}
