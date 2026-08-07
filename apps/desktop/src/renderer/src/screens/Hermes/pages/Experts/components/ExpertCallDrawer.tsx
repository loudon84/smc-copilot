import { useEffect, useState } from "react";

import { useTranslation } from "react-i18next";

import type { RemoteExpertSkill } from "../../../../../../../shared/hermes-experts/hermes-experts-contract";

import type { HermesExpert } from "../../../types/hermes-experts";

import type { RemoteRunContext } from "../../../../../../../shared/hermes-experts/hermes-experts-contract";

import { buildPageContextFromStorage } from "../../../utils/remote-expert-context";



type Props = {

  expert: HermesExpert | null;

  open: boolean;

  loading?: boolean;

  error?: string | null;

  onClose: () => void;

  onConfirm: (input: { prompt: string; skillName?: string; context?: RemoteRunContext }) => void;

};



export function ExpertCallDrawer({ expert, open, loading, error, onClose, onConfirm }: Props) {

  const { t } = useTranslation();

  const [prompt, setPrompt] = useState("");

  const [includeContext, setIncludeContext] = useState(true);

  const [skills, setSkills] = useState<RemoteExpertSkill[]>([]);

  const [skillsLoading, setSkillsLoading] = useState(false);

  const [skillName, setSkillName] = useState("");

  const [skillsError, setSkillsError] = useState<string | null>(null);



  const expertSlug = expert?.expertSlug ?? expert?.slug;



  useEffect(() => {

    if (!open || !expertSlug || typeof window.hermesExperts === "undefined") {

      setSkills([]);

      setSkillName("");

      return;

    }

    let cancelled = false;

    setSkillsLoading(true);

    setSkillsError(null);

    void window.hermesExperts.listExpertSkills(expertSlug).then((res) => {

      if (cancelled) return;

      setSkillsLoading(false);

      if (!res.ok || !res.data?.length) {

        setSkillsError(res.error ?? "No skills available");

        setSkills([]);

        return;

      }

      setSkills(res.data);

      const firstEnabled = res.data.find((s) => s.callEnabled !== false) ?? res.data[0];

      setSkillName(firstEnabled.skillName);

    });

    return () => {

      cancelled = true;

    };

  }, [open, expertSlug]);



  if (!open || !expert) return null;



  const selectedSkill = skills.find((s) => s.skillName === skillName);



  const handleSubmit = () => {

    const trimmed = prompt.trim() || expert.starterPrompts[0]?.prompt || "";

    const context = includeContext ? buildPageContextFromStorage() : undefined;

    onConfirm({ prompt: trimmed, skillName: skillName || undefined, context });

  };



  return (

    <div className="hermes-drawer-backdrop" role="presentation" onClick={onClose}>

      <aside

        className="hermes-drawer hermes-expert-call-drawer"

        role="dialog"

        aria-label={expert.displayName}

        onClick={(e) => e.stopPropagation()}

      >

        <header className="hermes-drawer__header">

          <h2>{t("workspaces.hermes.experts.callTitle", { defaultValue: "Summon expert" })}</h2>

          <button type="button" className="hermes-icon-button" onClick={onClose}>

            ×

          </button>

        </header>

        <div className="hermes-drawer__body">

          <p className="hermes-muted">{expert.displayName}</p>

          {expertSlug ? (

            <p className="hermes-muted">

              {t("workspaces.hermes.experts.expertSlug", { defaultValue: "Slug" })}: <code>{expertSlug}</code>

            </p>

          ) : null}

          <label className="hermes-field hermes-skill-select">

            <span>{t("workspaces.hermes.experts.skillName", { defaultValue: "Skill" })}</span>

            {skillsLoading ? (

              <p className="hermes-muted">{t("workspaces.hermes.common.loading", { defaultValue: "Loading…" })}</p>

            ) : (

              <select value={skillName} onChange={(e) => setSkillName(e.target.value)} disabled={skills.length === 0}>

                {skills.map((s) => (

                  <option key={s.skillName} value={s.skillName}>

                    {s.displayName}

                    {s.riskLevel ? ` (${s.riskLevel})` : ""}

                  </option>

                ))}

              </select>

            )}

            {selectedSkill?.description ? <p className="hermes-muted">{selectedSkill.description}</p> : null}

            {selectedSkill?.riskLevel || selectedSkill?.approvalMode ? (

              <div className="hermes-skill-badges">

                {selectedSkill.riskLevel ? (

                  <span className="hermes-badge">{selectedSkill.riskLevel}</span>

                ) : null}

                {selectedSkill.approvalMode && selectedSkill.approvalMode !== "none" ? (

                  <span className="hermes-badge">{selectedSkill.approvalMode}</span>

                ) : null}

              </div>

            ) : null}

            {skillsError ? <p className="hermes-page__error">{skillsError}</p> : null}

          </label>

          <label className="hermes-field">

            <span>{t("workspaces.hermes.experts.prompt", { defaultValue: "Prompt" })}</span>

            <textarea

              rows={5}

              value={prompt}

              onChange={(e) => setPrompt(e.target.value)}

              placeholder={expert.starterPrompts[0]?.prompt}

            />

          </label>

          <label className="hermes-checkbox">

            <input

              type="checkbox"

              checked={includeContext}

              onChange={(e) => setIncludeContext(e.target.checked)}

            />

            {t("workspaces.hermes.experts.includeContext", {

              defaultValue: "Include page / screen context",

            })}

          </label>

          {error ? <p className="hermes-page__error">{error}</p> : null}

        </div>

        <footer className="hermes-drawer__footer">

          <button type="button" className="hermes-btn-ghost" onClick={onClose}>

            {t("workspaces.hermes.experts.cancel")}

          </button>

          <button

            type="button"

            className="hermes-btn-primary"

            disabled={loading || skillsLoading || !skillName}

            onClick={handleSubmit}

          >

            {loading

              ? t("workspaces.hermes.experts.summoning", { defaultValue: "Summoning…" })

              : t("workspaces.hermes.experts.summon")}

          </button>

        </footer>

      </aside>

    </div>

  );

}


