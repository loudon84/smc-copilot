import type { ReactElement, ReactNode } from "react";
import { cn } from "@/utils/tailwind";

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
      className={cn(
        "flex min-h-[240px] flex-col gap-2 rounded-md border border-border bg-background",
        className,
      )}
      data-testid="file-preview"
    >
      {children}
    </div>
  );
}
