import { type ReactElement, type ReactNode } from "react";

export function PageToolbar(props: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div className={["ui-toolbar", props.className].filter(Boolean).join(" ")}>
      {props.children}
    </div>
  );
}
