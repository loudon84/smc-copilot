import { useState } from "react";
import { useTranslation } from "react-i18next";

const SCENARIOS = ["office", "sales", "data", "docs", "engineering"] as const;

type ScenarioKey = (typeof SCENARIOS)[number];

type Props = {
  activeScenario: ScenarioKey;
  onScenarioChange: (scenario: ScenarioKey) => void;
};

export function ScenarioTabs({ activeScenario, onScenarioChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="hermes-task-scenario-tabs">
      {SCENARIOS.map((key) => (
        <button
          key={key}
          type="button"
          className={`hermes-task-scenario-tabs__item${activeScenario === key ? " is-active" : ""}`}
          onClick={() => onScenarioChange(key)}
        >
          {t(`workspaces.hermes.tasks.scenario.${key}`)}
        </button>
      ))}
    </div>
  );
}

export type { ScenarioKey };
