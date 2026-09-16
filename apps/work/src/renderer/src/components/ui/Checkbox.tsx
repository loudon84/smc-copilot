import { type InputHTMLAttributes, type ReactElement, type ReactNode } from "react";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: ReactNode;
};

export function Checkbox({ className, label, ...props }: CheckboxProps): ReactElement {
  const input = (
    <input
      type="checkbox"
      className={["ui-checkbox", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
  if (label == null) return input;
  return (
    <label className="ui-checkbox-row">
      {input}
      <span>{label}</span>
    </label>
  );
}
