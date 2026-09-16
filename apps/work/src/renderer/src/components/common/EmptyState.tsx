import { type ReactElement } from "react";

export function EmptyState(props: {
  title: string;
  description?: string;
  testId?: string;
}): ReactElement {
  return (
    <section className="ui-empty" aria-live="polite" data-testid={props.testId}>
      <strong>{props.title}</strong>
      {props.description ? <p>{props.description}</p> : null}
    </section>
  );
}
