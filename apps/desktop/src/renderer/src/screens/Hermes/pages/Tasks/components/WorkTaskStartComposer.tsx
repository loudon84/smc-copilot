import { useEffect, useState } from "react";
import { Paperclip, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  WorkTaskMode,
  WorkTaskPermissionMode,
} from "../../../../../../../shared/work/work-task-contract";
import { TeamSelector } from "./composer/TeamSelector";
import { ModeSelector } from "./composer/ModeSelector";
import { PermissionSelector } from "./composer/PermissionSelector";
import { ExpertSelector } from "./composer/ExpertSelector";
import { SkillSelector } from "./composer/SkillSelector";

export type WorkTaskStartComposerState = {
  text: string;
  selectedTeamId?: string;
  selectedExpertIds: string[];
  selectedSkillIds: string[];
  mode: WorkTaskMode;
  permissionMode: WorkTaskPermissionMode;
};

type Props = {
  initialText?: string;
  busy?: boolean;
  onSubmit: (state: WorkTaskStartComposerState) => void;
};

export function WorkTaskStartComposer({ initialText = "", busy, onSubmit }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState(initialText);
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>();
  const [selectedExpertIds, setSelectedExpertIds] = useState<string[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [mode, setMode] = useState<WorkTaskMode>("execute");
  const [permissionMode, setPermissionMode] = useState<WorkTaskPermissionMode>("default");

  useEffect(() => {
    if (initialText) setText(initialText);
  }, [initialText]);

  const handleSubmit = () => {
    if (!text.trim() || busy) return;
    onSubmit({
      text: text.trim(),
      selectedTeamId,
      selectedExpertIds,
      selectedSkillIds,
      mode,
      permissionMode,
    });
    setText("");
  };

  return (
    <div className="hermes-task-composer hermes-work-task-start-composer">
      <textarea
        className="hermes-task-composer__input"
        placeholder={t("workspaces.hermes.tasks.composer.placeholder", {
          defaultValue: "Describe your task…",
        })}
        value={text}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
        }}
      />
      <ExpertSelector value={selectedExpertIds} onChange={setSelectedExpertIds} />
      <SkillSelector value={selectedSkillIds} onChange={setSelectedSkillIds} />
      <div className="hermes-task-composer__toolbar">
        <div className="hermes-task-composer__selectors">
          <label>
            <span>{t("workspaces.hermes.tasks.composer.team", { defaultValue: "Team" })}</span>
            <TeamSelector value={selectedTeamId} onChange={setSelectedTeamId} />
          </label>
          <label>
            <span>{t("workspaces.hermes.tasks.composer.mode", { defaultValue: "Mode" })}</span>
            <ModeSelector value={mode} onChange={setMode} />
          </label>
          <label>
            <span>{t("workspaces.hermes.tasks.composer.permission", { defaultValue: "Permission" })}</span>
            <PermissionSelector value={permissionMode} onChange={setPermissionMode} />
          </label>
        </div>
        <div className="hermes-task-composer__actions">
          <button
            type="button"
            className="hermes-icon-button"
            title={t("workspaces.hermes.tasks.composer.attach", { defaultValue: "Attach" })}
          >
            <Paperclip size={16} />
          </button>
          <button
            type="button"
            className="hermes-btn-primary"
            onClick={handleSubmit}
            disabled={!text.trim() || busy}
          >
            <Send size={14} />
            {t("workspaces.hermes.tasks.composer.send", { defaultValue: "Start task" })}
          </button>
        </div>
      </div>
    </div>
  );
}
