import { type ReactElement } from "react";
import { Badge, type BadgeTone } from "../ui/Badge";

export function StatusBadge(props: {
  children: import("react").ReactNode;
  tone?: BadgeTone;
  className?: string;
  testId?: string;
  persistent?: boolean;
  displayOnly?: boolean;
}): ReactElement {
  return (
    <Badge
      tone={props.tone}
      className={props.className}
      data-testid={props.testId}
      data-persistent={props.persistent ? "true" : undefined}
      data-display-only={props.displayOnly ? "true" : undefined}
      role="status"
      aria-live="polite"
    >
      {props.children}
    </Badge>
  );
}
