/**
 * Dropdown menu primitives — styles aligned with
 * smc-coworker-full/frontend/components/ui/dropdown-menu.tsx
 * (mapped to Hermes Desktop CSS variables for light/dark).
 */
import * as React from "react";
import { Check, Circle } from "lucide-react";
import { cn } from "../../lib/utils";

/** Panel container (Radix DropdownMenuContent equivalent). */
export const dropdownMenuContentClass = cn(
  "z-[999] min-w-[8rem] overflow-hidden rounded-md border p-1 shadow-md",
  "border-[var(--border-bright)] bg-[var(--bg-elevated)] text-[var(--text-primary)]",
);

export const dropdownMenuItemClass = cn(
  "relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
  "text-[var(--text-primary)] hover:bg-[var(--bg-hover)] focus:bg-[var(--bg-hover)]",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
);

export const dropdownMenuLabelClass = cn(
  "px-2 py-1.5 text-sm font-semibold text-[var(--text-secondary)]",
);

export const dropdownMenuSeparatorClass = cn(
  "-mx-1 my-1 h-px bg-[var(--border-bright)]",
);

export const dropdownMenuShortcutClass = cn(
  "ml-auto text-xs tracking-widest text-[var(--text-muted)]",
);

export interface DropdownMenuPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  inset?: boolean;
}

export const DropdownMenuPanel = React.forwardRef<HTMLDivElement, DropdownMenuPanelProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn(dropdownMenuContentClass, className)} {...props} />
  ),
);
DropdownMenuPanel.displayName = "DropdownMenuPanel";

export interface DropdownMenuLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  inset?: boolean;
}

export const DropdownMenuLabel = React.forwardRef<HTMLDivElement, DropdownMenuLabelProps>(
  ({ className, inset, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(dropdownMenuLabelClass, inset && "pl-8", className)}
      {...props}
    />
  ),
);
DropdownMenuLabel.displayName = "DropdownMenuLabel";

export const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn(dropdownMenuSeparatorClass, className)} {...props} />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>): React.JSX.Element => (
  <span className={cn(dropdownMenuShortcutClass, className)} {...props} />
);

export interface DropdownMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  inset?: boolean;
  selected?: boolean;
  danger?: boolean;
}

export const DropdownMenuItem = React.forwardRef<HTMLButtonElement, DropdownMenuItemProps>(
  ({ className, inset, selected, danger, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        dropdownMenuItemClass,
        selected && "bg-[var(--accent-subtle)] text-[var(--accent-text)]",
        danger && "text-[var(--error)] hover:bg-[var(--error-bg)] focus:bg-[var(--error-bg)]",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  ),
);
DropdownMenuItem.displayName = "DropdownMenuItem";

/** Radio-style row with leading indicator (Radix DropdownMenuRadioItem look). */
export interface DropdownMenuRadioItemProps extends DropdownMenuItemProps {
  checked?: boolean;
}

export const DropdownMenuRadioItem = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuRadioItemProps
>(({ className, checked, children, ...props }, ref) => (
  <DropdownMenuItem ref={ref} className={cn("pl-8", className)} selected={checked} {...props}>
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      {checked ? <Circle className="h-2 w-2 fill-current text-[var(--accent-text)]" /> : null}
    </span>
    {children}
  </DropdownMenuItem>
));
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

/** Checkbox-style row with leading check (Radix DropdownMenuCheckboxItem look). */
export interface DropdownMenuCheckboxItemProps extends DropdownMenuItemProps {
  checked?: boolean;
}

export const DropdownMenuCheckboxItem = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuCheckboxItemProps
>(({ className, checked, children, ...props }, ref) => (
  <DropdownMenuItem ref={ref} className={cn("pl-8", className)} {...props}>
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      {checked ? <Check className="h-4 w-4 text-[var(--accent-text)]" /> : null}
    </span>
    {children}
  </DropdownMenuItem>
));
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";
