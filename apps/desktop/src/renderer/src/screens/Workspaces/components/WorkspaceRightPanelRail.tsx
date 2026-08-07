import { PanelRightOpen } from "lucide-react";
import { useI18n } from "../../../components/useI18n";
import { LAYOUT } from "../constants";
import { useWorkspaces } from "../context/WorkspacesContext";

/** Narrow rail shown when the right inspector is collapsed — keeps expand affordance visible. */
export function WorkspaceRightPanelRail(): React.JSX.Element {
  const { t } = useI18n();
  const { setRightPanelCollapsed } = useWorkspaces();

  return (
    <aside
      className="workspaces-right-rail"
      style={
        {
          "--ws-right-width": `${LAYOUT.rightPanelCollapsedWidthPx}px`,
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        onClick={() => setRightPanelCollapsed(false)}
        className="workspaces-icon-button"
        title={t("workspaces.inspector.expand", { defaultValue: "Expand inspector" })}
      >
        <PanelRightOpen size={16} />
      </button>
    </aside>
  );
}
