import { type HTMLAttributes, type ReactElement, type TableHTMLAttributes } from "react";

export function Table({
  className,
  wrapClassName,
  ...props
}: TableHTMLAttributes<HTMLTableElement> & { wrapClassName?: string }): ReactElement {
  return (
    <div className={["ui-table-wrap", wrapClassName].filter(Boolean).join(" ")}>
      <table className={["ui-table", className].filter(Boolean).join(" ")} {...props} />
    </div>
  );
}

export function TableHead(props: HTMLAttributes<HTMLTableSectionElement>): ReactElement {
  return <thead {...props} />;
}

export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>): ReactElement {
  return <tbody {...props} />;
}
