import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { FrameTreePanel } from "./FrameTreePanel";
import { ElementListPanel } from "./ElementListPanel";
import { usePageSnapshot } from "./hooks/use-page-snapshot";
import type { BrowserElementSnapshot } from "../../../../shared/browser/browser-snapshot-contract";
import { PageSelectorActionBar } from "./panels/PageSelectorActionBar";
import { PageFrameHtmlInspector } from "./panels/PageFrameHtmlInspector";

interface PageStructurePanelProps {
  className?: string;
  /** Increment to trigger snapshot refresh from parent toolbar */
  externalRefreshTrigger?: number;
}

export function PageStructurePanel({
  className,
  externalRefreshTrigger = 0,
}: PageStructurePanelProps): React.JSX.Element {
  const {
    snapshot,
    isLoading,
    error,
    selectedFrameId,
    setSelectedFrameId,
    filteredElements,
    refresh,
  } = usePageSnapshot();

  useEffect(() => {
    if (externalRefreshTrigger > 0) {
      void refresh();
    }
  }, [externalRefreshTrigger, refresh]);

  const handleTestClick = async (element: BrowserElementSnapshot): Promise<void> => {
    await window.aiosBrowser.clickElement({
      elementId: element.elementId,
      selector: element.selector,
      frame: { frameId: element.frameId },
    });
  };

  const handleTestType = async (
    element: BrowserElementSnapshot,
    text: string,
  ): Promise<void> => {
    await window.aiosBrowser.typeElement(
      {
        elementId: element.elementId,
        selector: element.selector,
        placeholder: element.placeholder,
        frame: { frameId: element.frameId },
      },
      text,
      { clear: true },
    );
  };

  return (
    <div className={`flex flex-col min-h-0 ${className ?? ""}`}>
      <div className="px-3 py-2 border-b border-neutral-700 flex items-center justify-between shrink-0">
        <h3 className="text-sm font-medium text-neutral-300">Page Structure</h3>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isLoading}
          className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200"
          title="Refresh Snapshot"
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>
      {error && <p className="text-xs text-red-400 px-3 py-1">{error}</p>}
      {snapshot?.errors.length ? (
        <p className="text-xs text-amber-500 px-3 py-1">
          {snapshot.errors.length} frame snapshot error(s)
        </p>
      ) : null}
      <FrameTreePanel
        frames={snapshot?.frames ?? []}
        selectedFrameId={selectedFrameId}
        onSelectFrame={setSelectedFrameId}
        errors={snapshot?.errors.map((e) => ({ frameId: e.frameId, message: e.message }))}
      />
      <PageSelectorActionBar selectedFrameId={selectedFrameId} />
      <PageFrameHtmlInspector
        selectedFrameId={selectedFrameId}
        frames={snapshot?.frames ?? []}
      />
      <ElementListPanel
        elements={filteredElements}
        onTestClick={handleTestClick}
        onTestType={handleTestType}
      />
    </div>
  );
}
