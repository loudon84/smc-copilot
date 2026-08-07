import { useTranslation } from "react-i18next";
import { useHermesDefault } from "../context/HermesDefaultContext";
import { useHermesWorkspace } from "../context/HermesWorkspaceContext";
import type { HermesRightInspectorTab } from "../types";

const DEFAULT_TABS: HermesRightInspectorTab[] = ["workspace", "runtime"];
const EXPERT_TABS: HermesRightInspectorTab[] = ["timeline", "artifacts", "toolsMcp", "members", "audit"];

const TAB_LABELS: Record<HermesRightInspectorTab, string> = {
  workspace: "workspaces.tabs.workspace",
  runtime: "workspaces.tabs.runtime",
  skills: "workspaces.tabs.skills",
  memory: "workspaces.tabs.memory",
  timeline: "workspaces.hermes.expertRuns.timeline",
  artifacts: "workspaces.hermes.expertRuns.artifacts",
  toolsMcp: "workspaces.hermes.inspector.toolsMcp",
  members: "workspaces.hermes.expertTeams.members",
  audit: "workspaces.hermes.inspector.audit",
};

export function HermesRightInspectorTabs() {
  const { t } = useTranslation();
  const workspace = useHermesWorkspace();
  const { activeRightTab, setActiveRightTab, rightPanelCollapsed, setRightPanelCollapsed } =
    useHermesDefault();

  const tabs = workspace.mode === "default" ? DEFAULT_TABS : EXPERT_TABS;

  return (
    <div className="hermes-right-tabs">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => setActiveRightTab(tab)}
          className={`hermes-right-tab${activeRightTab === tab ? " is-active" : ""}`}
        >
          {t(TAB_LABELS[tab], { defaultValue: tab })}
        </button>
      ))}
      <button
        type="button"
        className="hermes-right-tab hermes-right-tabs-collapse"
        onClick={() => setRightPanelCollapsed(true)}
        title={t("workspaces.inspector.collapse", { defaultValue: "Collapse inspector" })}
      >
        «
      </button>
    </div>
  );
}
