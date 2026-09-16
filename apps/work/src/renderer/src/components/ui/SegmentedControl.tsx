import { type ReactElement, type ReactNode } from "react";

export type SegmentedOption<T extends string> = {
  id: T;
  label: ReactNode;
  testId?: string;
};

export function SegmentedControl<T extends string>(props: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  className?: string;
}): ReactElement {
  return (
    <div
      className={["ui-segmented", props.className].filter(Boolean).join(" ")}
      role="group"
      aria-label={props.ariaLabel}
    >
      {props.options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="ui-segmented__item"
          aria-pressed={option.id === props.value}
          data-testid={option.testId}
          onClick={() => props.onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
