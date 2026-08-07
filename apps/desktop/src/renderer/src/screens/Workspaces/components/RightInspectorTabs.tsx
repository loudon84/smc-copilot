import { useI18n } from "../../../components/useI18n";
import { useWorkspaces } from "../context/WorkspacesContext";
import type { RightInspectorTab } from "../types";

const TABS: RightInspectorTab[] = ["workspace", "runtime"];

export function RightInspectorTabs(): React.JSX.Element {
  const { t } = useI18n();
  const { activeRightTab, setActiveRightTab, rightPanelCollapsed, setRightPanelCollapsed } =
    useWorkspaces();

  return (
    <div className="workspaces-right-tabs">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => setActiveRightTab(tab)}
          className={`workspaces-right-tab ${activeRightTab === tab ? "is-active" : ""}`}
        >
          {t(`workspaces.tabs.${tab}`, { defaultValue: tab })}
        </button>
      ))}
      <button
        type="button"
        className="workspaces-right-tab workspaces-right-tabs-collapse"
        onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
        title={
          rightPanelCollapsed
            ? t("workspaces.inspector.expand", { defaultValue: "Expand inspector" })
            : t("workspaces.inspector.collapse", { defaultValue: "Collapse inspector" })
        }
      >
        {rightPanelCollapsed ? "»" : "«"}
      </button>
    </div>
  );
}
