import { type HTMLAttributes, type ReactElement } from "react";

export type BadgeTone = "default" | "success" | "warning" | "error";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({
  tone = "default",
  className,
  ...props
}: BadgeProps): ReactElement {
  return (
    <span
      className={["ui-badge", tone !== "default" ? `ui-badge--${tone}` : "", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
