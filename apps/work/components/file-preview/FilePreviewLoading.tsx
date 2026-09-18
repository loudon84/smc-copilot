import type { ReactElement } from "react";
import { Loader2 } from "lucide-react";
import type { FilePreviewLoadPhase } from "./types";

export type FilePreviewLoadingProps = {
  phase?: FilePreviewLoadPhase;
  fileName?: string;
  testId?: string;
};

function messageForPhase(
  phase: FilePreviewLoadPhase | undefined,
  fileName?: string,
): string {
  const name = fileName?.trim();
  if (phase === "download") {
    return name ? `Downloading ${name}…` : "Downloading file…";
  }
  if (phase === "prepare") {
    return name ? `Preparing preview for ${name}…` : "Preparing preview…";
  }
  return name ? `Loading ${name}…` : "Loading preview…";
}

/**
 * Visible loading surface while providers download / materialize bytes.
 */
export function FilePreviewLoading({
  phase,
  fileName,
  testId = "file-preview-loading",
}: FilePreviewLoadingProps): ReactElement {
  return (
    <div
      className="flex min-h-[240px] flex-col items-center justify-center gap-3 px-4 py-8"
      data-testid={testId}
      data-phase={phase ?? "loading"}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2
        className="h-8 w-8 animate-spin text-muted-foreground"
        aria-hidden
      />
      <p className="text-sm text-muted-foreground">
        {messageForPhase(phase, fileName)}
      </p>
      {phase === "download" ? (
        <div
          className="h-1 w-40 overflow-hidden rounded-full bg-muted"
          data-testid={`${testId}-bar`}
        >
          <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/60" />
        </div>
      ) : null}
    </div>
  );
}
