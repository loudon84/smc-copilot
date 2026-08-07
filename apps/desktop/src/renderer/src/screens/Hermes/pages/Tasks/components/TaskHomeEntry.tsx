import { useState } from "react";
import { useTranslation } from "react-i18next";
import { WorkTaskStartComposer, type WorkTaskStartComposerState } from "./WorkTaskStartComposer";
import { ScenarioTabs, type ScenarioKey } from "./ScenarioTabs";
import { QuickPromptChips } from "./QuickPromptChips";
import { RecentTaskCards } from "./RecentTaskCards";
import { WorkTaskStatusBar } from "./WorkTaskStatusBar";
import { useWorkTaskStore } from "../../../features/task-store/useWorkTaskStore";

type Props = {
  onTaskStarted: () => void;
};

export function TaskHomeEntry({ onTaskStarted }: Props) {
  const { t } = useTranslation();
  const { startTask } = useWorkTaskStore();
  const [scenario, setScenario] = useState<ScenarioKey>("sales");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (state: WorkTaskStartComposerState) => {
    setBusy(true);
    try {
      const task = await startTask({
        prompt: state.text,
        selectedTeamId: state.selectedTeamId,
        selectedExpertIds: state.selectedExpertIds,
        selectedSkillIds: state.selectedSkillIds,
        mode: state.mode,
        permissionMode: state.permissionMode,
      });
      if (task) onTaskStarted();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hermes-task-home">
      <WorkTaskStatusBar />
      <header className="hermes-task-home__hero hermes-task-home__hero--compact">
        <h2>{t("workspaces.hermes.tasks.heroTitle", { defaultValue: "Work Tasks" })}</h2>
        <p>{t("workspaces.hermes.tasks.heroSubtitle", { defaultValue: "Start a task bound to Hermes session" })}</p>
      </header>

      <ScenarioTabs activeScenario={scenario} onScenarioChange={setScenario} />
      <QuickPromptChips scenario={scenario} onSelect={setDraftPrompt} />

      <div className="hermes-task-home__composer">
        <WorkTaskStartComposer initialText={draftPrompt} busy={busy} onSubmit={handleSubmit} />
      </div>

      <RecentTaskCards onContinue={() => onTaskStarted()} />
    </div>
  );
}
