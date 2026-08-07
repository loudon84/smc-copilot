import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { HermesExpertTeam } from "../../../types/hermes-expert-teams";
import type { RemoteRunContext } from "../../../../../../../shared/hermes-experts/hermes-experts-contract";
import { buildPageContextFromStorage } from "../../../utils/remote-expert-context";

type Props = {
  team: HermesExpertTeam | null;
  open: boolean;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (input: { prompt: string; context?: RemoteRunContext }) => void;
};

export function ExpertTeamCallDrawer({ team, open, loading, error, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState("");
  const [includeContext, setIncludeContext] = useState(true);

  if (!open || !team) return null;

  const handleSubmit = () => {
    const trimmed = prompt.trim() || team.starterPrompts[0]?.prompt || "";
    const context = includeContext ? buildPageContextFromStorage() : undefined;
    onConfirm({ prompt: trimmed, context });
  };

  return (
    <div className="hermes-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="hermes-drawer hermes-expert-call-drawer"
        role="dialog"
        aria-label={team.displayName}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="hermes-drawer__header">
          <h2>{t("workspaces.hermes.expertTeams.callTitle", { defaultValue: "Summon team" })}</h2>
          <button type="button" className="hermes-icon-button" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="hermes-drawer__body">
          <p className="hermes-muted">{team.displayName}</p>
          {team.toolName ? (
            <p>
              {t("workspaces.hermes.experts.toolName", { defaultValue: "MCP tool" })}:{" "}
              <code>{team.toolName}</code>
            </p>
          ) : null}
          <label className="hermes-field">
            <span>{t("workspaces.hermes.experts.prompt", { defaultValue: "Prompt" })}</span>
            <textarea
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={team.starterPrompts[0]?.prompt}
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
          <button type="button" className="hermes-btn-primary" disabled={loading} onClick={handleSubmit}>
            {loading
              ? t("workspaces.hermes.expertTeams.summoning", { defaultValue: "Summoning…" })
              : t("workspaces.hermes.expertTeams.summonTeam")}
          </button>
        </footer>
      </aside>
    </div>
  );
}
