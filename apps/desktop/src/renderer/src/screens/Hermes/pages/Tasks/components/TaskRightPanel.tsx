import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { WorkTask } from "../../../../../../../shared/work/work-task-contract";
import type { WorkTaskEvent } from "../../../../../../../shared/work/work-event-contract";
import type { WorkOutput } from "../../../../../../../shared/work/work-output-contract";
import type { WorkParticipant } from "../../../../../../../shared/work/work-participant-contract";
import type { WorkTaskRightPanelTab } from "../../../features/task-store/workTaskReducer";
import { OutputPreviewPanel } from "./right-panel/OutputPreviewPanel";
import { ContextPanel } from "./right-panel/ContextPanel";
import { ParticipantsPanel } from "./right-panel/ParticipantsPanel";
import { SkillsPanel } from "./right-panel/SkillsPanel";
import { GovernancePanel } from "./right-panel/GovernancePanel";

const TABS: WorkTaskRightPanelTab[] = [
  "output",
  "context",
  "participants",
  "skills",
  "governance",
];

type Props = {
  open: boolean;
  tab: WorkTaskRightPanelTab;
  task: WorkTask;
  events: WorkTaskEvent[];
  outputs: WorkOutput[];
  participants: WorkParticipant[];
  onTabChange: (tab: WorkTaskRightPanelTab) => void;
  onClose: () => void;
};

export function TaskRightPanel({
  open,
  tab,
  task,
  events,
  outputs,
  participants,
  onTabChange,
}: Props) {
  const { t } = useTranslation();
  const [selectedOutputId, setSelectedOutputId] = useState<string | undefined>();

  if (!open) return null;

  return (
    <aside className="hermes-task-right-panel">
      <div className="hermes-task-right-panel__tabs">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            className={`hermes-task-right-panel__tab${tab === key ? " is-active" : ""}`}
            onClick={() => onTabChange(key)}
          >
            {t(`workspaces.hermes.tasks.rightPanel.${key}`)}
          </button>
        ))}
      </div>
      <div className="hermes-task-right-panel__body">
        {tab === "output" ? (
          <OutputPreviewPanel
            outputs={outputs}
            selectedOutputId={selectedOutputId}
            onSelect={setSelectedOutputId}
          />
        ) : null}
        {tab === "context" ? <ContextPanel contextRefs={task.contextRefs} /> : null}
        {tab === "participants" ? <ParticipantsPanel participants={participants} /> : null}
        {tab === "skills" ? <SkillsPanel skillIds={task.selectedSkillIds} /> : null}
        {tab === "governance" ? <GovernancePanel events={events} /> : null}
      </div>
    </aside>
  );
}
