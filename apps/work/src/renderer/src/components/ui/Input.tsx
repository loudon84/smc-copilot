import { type InputHTMLAttributes, type ReactElement } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps): ReactElement {
  return (
    <input className={["ui-input", className].filter(Boolean).join(" ")} {...props} />
  );
}
