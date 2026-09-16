import { type ButtonHTMLAttributes, type ReactElement } from "react";

export type ButtonVariant = "secondary" | "primary" | "danger" | "ghost";
export type ButtonSize = "md" | "sm";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps): ReactElement {
  return (
    <button
      type={type}
      className={["ui-button", `ui-button--${variant}`, size === "sm" ? "ui-button--sm" : "", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
