import { type LabelHTMLAttributes, type ReactElement } from "react";

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className, ...props }: LabelProps): ReactElement {
  return (
    <label className={["ui-label", className].filter(Boolean).join(" ")} {...props} />
  );
}
