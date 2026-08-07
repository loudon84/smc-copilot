import { useEffect, useState } from "react";
import { Paperclip, Send, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  WorkTaskMode,
  WorkTaskPermissionMode,
} from "../../../../../../../shared/work/work-task-contract";
import { TeamSelector } from "./composer/TeamSelector";
import { ModeSelector } from "./composer/ModeSelector";
import { PermissionSelector } from "./composer/PermissionSelector";

export type TaskComposerState = {
  text: string;
  selectedTeamId?: string;
  mode: WorkTaskMode;
  permissionMode: WorkTaskPermissionMode;
};

type Props = {
  taskId?: string;
  initialText?: string;
  isStreaming?: boolean;
  compact?: boolean;
  onSubmit: (state: TaskComposerState) => void;
  onStop?: () => void;
};

export function TaskComposer({
  taskId,
  initialText = "",
  isStreaming,
  compact,
  onSubmit,
  onStop,
}: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState(initialText);
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>();
  const [mode, setMode] = useState<WorkTaskMode>("execute");
  const [permissionMode, setPermissionMode] = useState<WorkTaskPermissionMode>("default");

  useEffect(() => {
    if (initialText) setText(initialText);
  }, [initialText]);

  const handleSubmit = () => {
    if (!text.trim() || isStreaming) return;
    onSubmit({ text: text.trim(), selectedTeamId, mode, permissionMode });
    if (!taskId) setText("");
  };

  return (
    <div className={`hermes-task-composer${compact ? " is-compact" : ""}`}>
      <textarea
        className="hermes-task-composer__input"
        placeholder={t("workspaces.hermes.tasks.composer.placeholder")}
        value={text}
        rows={compact ? 3 : 4}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
        }}
      />
      <div className="hermes-task-composer__toolbar">
        <div className="hermes-task-composer__selectors">
          <label>
            <span>{t("workspaces.hermes.tasks.composer.team")}</span>
            <TeamSelector value={selectedTeamId} onChange={setSelectedTeamId} disabled={Boolean(taskId)} />
          </label>
          <label>
            <span>{t("workspaces.hermes.tasks.composer.mode")}</span>
            <ModeSelector value={mode} onChange={setMode} />
          </label>
          <label>
            <span>{t("workspaces.hermes.tasks.composer.permission")}</span>
            <PermissionSelector value={permissionMode} onChange={setPermissionMode} />
          </label>
        </div>
        <div className="hermes-task-composer__actions">
          <button type="button" className="hermes-icon-button" title={t("workspaces.hermes.tasks.composer.attach")}>
            <Paperclip size={16} />
          </button>
          {isStreaming ? (
            <button type="button" className="hermes-btn-ghost" onClick={onStop}>
              <Square size={14} />
              {t("workspaces.hermes.tasks.composer.stop")}
            </button>
          ) : (
            <button type="button" className="hermes-btn-primary" onClick={handleSubmit} disabled={!text.trim()}>
              <Send size={14} />
              {t("workspaces.hermes.tasks.composer.send")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
