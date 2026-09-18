import type { ReactElement, ReactNode } from "react";

export type FilePreviewContainerProps = {
  children: ReactNode;
  className?: string;
};

export function FilePreviewContainer({
  children,
  className,
}: FilePreviewContainerProps): ReactElement {
  return (
    <div
      className={
        className ??
        "flex min-h-[240px] flex-col gap-2 rounded-md border border-border bg-background"
      }
      data-testid="file-preview"
    >
      {children}
    </div>
  );
}
