import { Brain, Cpu, FolderOpen, PanelRightOpen, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LAYOUT } from "../constants";
import type { HermesRightInspectorTab } from "../types";
import { useHermesDefault } from "../context/HermesDefaultContext";

const TABS: Array<{ id: HermesRightInspectorTab; icon: typeof Cpu; title: string }> = [
  { id: "workspace", icon: FolderOpen, title: "Workspace" },
  { id: "runtime", icon: Cpu, title: "Runtime" },
];

export function HermesRightPanelRail({
  onOpenRuntimeSettings: _onOpenRuntimeSettings,
}: {
  onOpenRuntimeSettings?: () => void;
}) {
  const { t } = useTranslation();
  const { activeRightTab, setActiveRightTab, setRightPanelCollapsed } = useHermesDefault();

  return (
    <aside
      className="hermes-right-rail"
      style={
        {
          "--hermes-right-width": `${LAYOUT.rightPanelCollapsedWidthPx}px`,
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        onClick={() => setRightPanelCollapsed(false)}
        className="hermes-icon-button"
        title={t("workspaces.inspector.expand", { defaultValue: "Expand inspector" })}
      >
        <PanelRightOpen size={16} />
      </button>
      {TABS.map(({ id, icon: Icon, title }) => (
        <button
          key={id}
          type="button"
          className={`hermes-nav-button${activeRightTab === id ? " is-active" : ""}`}
          title={title}
          onClick={() => {
            setActiveRightTab(id);
            setRightPanelCollapsed(false);
          }}
        >
          <Icon size={16} />
        </button>
      ))}
    </aside>
  );
}
