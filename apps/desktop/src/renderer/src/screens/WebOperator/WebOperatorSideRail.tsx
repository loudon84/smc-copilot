import {
  Bot,
  Building2,
  Monitor,
  PanelRightClose,
  PanelRightOpen,
  ScanSearch,
  ScrollText,
} from "lucide-react";
import { useI18n } from "../../components/useI18n";
import {
  SECONDARY_NAV_BY_WORKSPACE,
  SECONDARY_PANEL_LABEL_KEYS,
} from "../../../../shared/workspace/workspace-secondary-nav";
import type { WorkspaceSecondaryPanel } from "../../../../shared/workspace/workspace-contract";
import { isWebOperatorPanelId } from "./panels/web-operator-panels-contract";

const PANEL_ICONS: Partial<
  Record<WorkspaceSecondaryPanel, React.ComponentType<{ size?: number }>>
> = {
  "browser-state": Monitor,
  "host-context": Building2,
  "crm-context": Building2,
  "hermes-task": Bot,
  "page-structure": ScanSearch,
  "action-log": ScrollText,
};

export interface WebOperatorSideRailProps {
  focusedPanel: string;
  onFocusedPanelChange?: (panel: string) => void;
  panelsOpen: boolean;
  onTogglePanelsOpen: () => void;
}

export function WebOperatorSideRail({
  focusedPanel,
  onFocusedPanelChange,
  panelsOpen,
  onTogglePanelsOpen,
}: WebOperatorSideRailProps): React.JSX.Element {
  const { t } = useI18n();
  const panels = SECONDARY_NAV_BY_WORKSPACE["web-operator"];

  const handlePanelClick = (panel: WorkspaceSecondaryPanel): void => {
    onFocusedPanelChange?.(panel);
    if (!panelsOpen) {
      onTogglePanelsOpen();
    }
  };

  return (
    <aside className="web-operator-side-rail" aria-label={t("navigation.webOperator")}>
      <button
        type="button"
        className="web-operator-side-rail__btn"
        title={
          panelsOpen ? t("navigation.webOperatorSide.collapse") : t("navigation.webOperatorSide.expand")
        }
        onClick={onTogglePanelsOpen}
      >
        {panelsOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
      </button>
      <div className="web-operator-side-rail__nav">
        {panels.map((panel) => {
          const IconComponent = PANEL_ICONS[panel] ?? Monitor;
          const active =
            isWebOperatorPanelId(focusedPanel) && focusedPanel === panel;
          const label = t(SECONDARY_PANEL_LABEL_KEYS[panel]);
          return (
            <button
              key={panel}
              type="button"
              className={`web-operator-side-rail__btn ${active ? "is-active" : ""}`}
              title={label}
              aria-label={label}
              aria-current={active ? "true" : undefined}
              onClick={() => handlePanelClick(panel)}
            >
              <IconComponent size={16} />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
