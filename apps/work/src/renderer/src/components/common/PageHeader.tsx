import { type ReactElement, type ReactNode } from "react";

export function PageHeader(props: {
  title: string;
  actions?: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <header className={["ui-page-header", props.className].filter(Boolean).join(" ")}>
      <h1 className="ui-page-header__title">{props.title}</h1>
      {props.actions}
    </header>
  );
}
