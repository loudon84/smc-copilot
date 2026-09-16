import { type ReactElement } from "react";

export type TabItem<T extends string> = {
  id: T;
  label: import("react").ReactNode;
};

export function Tabs<T extends string>(props: {
  tabs: ReadonlyArray<TabItem<T>>;
  active: T;
  onChange: (id: T) => void;
  labelledBy?: string;
  className?: string;
  tabTestId?: (id: T) => string;
}): ReactElement {
  return (
    <div
      className={["ui-tabs", props.className].filter(Boolean).join(" ")}
      role="tablist"
      aria-labelledby={props.labelledBy}
    >
      {props.tabs.map((tab) => {
        const selected = tab.id === props.active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={["ui-tab", selected ? "ui-tab--active" : ""].filter(Boolean).join(" ")}
            data-testid={props.tabTestId?.(tab.id)}
            onClick={() => props.onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
