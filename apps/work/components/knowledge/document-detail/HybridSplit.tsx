import type { ReactElement } from "react";
import { cn } from "@/utils/tailwind";

type HybridSplitProps = {
  sourcePane: ReactElement;
  chunkPane: ReactElement;
  /** Source pane width percent 30–70; default 42. */
  sourcePercent: number;
  onSourcePercentChange: (percent: number) => void;
  stacked: boolean;
};

const MIN = 30;
const MAX = 70;

export function HybridSplit({
  sourcePane,
  chunkPane,
  sourcePercent,
  onSourcePercentChange,
  stacked,
}: HybridSplitProps): ReactElement {
  const clamped = Math.min(MAX, Math.max(MIN, sourcePercent));

  if (stacked) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col gap-2"
        data-testid="document-detail-hybrid"
        data-layout="stacked"
      >
        <div
          className="min-h-0 min-w-0 flex-1 overflow-hidden"
          data-testid="document-detail-source-pane"
        >
          {sourcePane}
        </div>
        <div
          className="min-h-0 min-w-0 flex-1 overflow-hidden"
          data-testid="document-detail-chunk-pane"
        >
          {chunkPane}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-row"
      data-testid="document-detail-hybrid"
      data-layout="split"
    >
      <div
        className="min-h-0 min-w-0 overflow-hidden"
        data-testid="document-detail-source-pane"
        style={{ width: `${clamped}%` }}
      >
        {sourcePane}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={clamped}
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        tabIndex={0}
        data-testid="document-detail-split-divider"
        className={cn(
          "w-1.5 shrink-0 cursor-col-resize bg-border hover:bg-muted-foreground/40",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
        onPointerDown={(event) => {
          event.preventDefault();
          const target = event.currentTarget.parentElement;
          if (!target) return;
          const startX = event.clientX;
          const startPercent = clamped;
          const width = target.getBoundingClientRect().width;
          if (width <= 0) return;

          const onMove = (ev: PointerEvent): void => {
            const delta = ((ev.clientX - startX) / width) * 100;
            onSourcePercentChange(
              Math.min(MAX, Math.max(MIN, startPercent + delta)),
            );
          };
          const onUp = (): void => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        }}
      />
      <div
        className="min-h-0 min-w-0 flex-1 overflow-hidden"
        data-testid="document-detail-chunk-pane"
      >
        {chunkPane}
      </div>
    </div>
  );
}
