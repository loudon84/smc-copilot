import type { PropsWithChildren } from "react";
import type { WebOperatorPanelDefinition } from "./web-operator-panels-contract";

export interface WebOperatorPanelCardProps extends PropsWithChildren {
  panel: WebOperatorPanelDefinition;
  focused: boolean;
  panelRef: React.RefObject<HTMLDivElement | null>;
  /** 保活挂载但不可见（不卸载子树） */
  hidden?: boolean;
}

export function WebOperatorPanelCard({
  panel,
  focused,
  panelRef,
  hidden = false,
  children,
}: WebOperatorPanelCardProps): React.JSX.Element {
  return (
    <section
      ref={panelRef}
      data-panel-id={panel.id}
      aria-hidden={hidden}
      className={[
        "web-operator-panels__card",
        `web-operator-panels__card--${panel.size}`,
        focused ? "web-operator-panels__card--focused" : "",
        hidden ? "web-operator-panels__card--hidden" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="web-operator-panels__card-body">{children}</div>
    </section>
  );
}

