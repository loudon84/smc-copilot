import { type HTMLAttributes, type ReactElement, type ReactNode } from "react";

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "article" | "div" | "button" | "li";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
};

export function Card({
  as: Tag = "article",
  className,
  ...props
}: CardProps): ReactElement {
  return (
    <Tag className={["ui-card", className].filter(Boolean).join(" ")} {...props} />
  );
}

export function CardHead({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): ReactElement {
  return <div className={["ui-card__head", className].filter(Boolean).join(" ")} {...props} />;
}

export function CardTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}): ReactElement {
  return <strong className={["ui-card__title", className].filter(Boolean).join(" ")}>{children}</strong>;
}
