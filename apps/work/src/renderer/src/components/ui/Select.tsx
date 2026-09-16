import { type ReactElement, type SelectHTMLAttributes } from "react";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: SelectProps): ReactElement {
  return (
    <select className={["ui-select", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </select>
  );
}
