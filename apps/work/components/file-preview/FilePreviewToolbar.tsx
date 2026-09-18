import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";

export type FilePreviewToolbarProps = {
  fileName?: string;
  onRetry?: () => void;
  retryDisabled?: boolean;
};

export function FilePreviewToolbar({
  fileName,
  onRetry,
  retryDisabled,
}: FilePreviewToolbarProps): ReactElement {
  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-border px-3 py-2"
      data-testid="file-preview-toolbar"
    >
      <span className="truncate text-sm font-medium" title={fileName}>
        {fileName ?? ""}
      </span>
      {onRetry ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="file-preview-retry"
          disabled={retryDisabled}
          onClick={onRetry}
        >
          Retry
        </Button>
      ) : null}
    </div>
  );
}
