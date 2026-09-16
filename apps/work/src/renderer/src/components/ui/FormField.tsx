import { type ReactElement, type ReactNode } from "react";

export function FormField(props: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div className={["ui-form-field", props.className].filter(Boolean).join(" ")}>
      <label className="ui-form-field__label" htmlFor={props.htmlFor}>
        {props.label}
      </label>
      {props.children}
    </div>
  );
}
