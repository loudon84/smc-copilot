import { type HTMLAttributes, type ReactElement } from "react";

export type ProgressProps = HTMLAttributes<HTMLDivElement> & {
  value: number;
};

export function Progress({ value, className, ...props }: ProgressProps): ReactElement {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={["ui-progress", className].filter(Boolean).join(" ")}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      {...props}
    >
      <div className="ui-progress__bar" style={{ width: `${clamped}%` }} />
    </div>
  );
}
