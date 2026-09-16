import { type ReactElement, type TextareaHTMLAttributes } from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps): ReactElement {
  return (
    <textarea className={["ui-textarea", className].filter(Boolean).join(" ")} {...props} />
  );
}
