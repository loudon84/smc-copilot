import { useState } from "react";
import { MousePointer2, Keyboard } from "lucide-react";
import type { BrowserElementSnapshot } from "../../../../shared/browser/browser-snapshot-contract";

interface ElementListPanelProps {
  elements: BrowserElementSnapshot[];
  onTestClick: (element: BrowserElementSnapshot) => Promise<void>;
  onTestType: (element: BrowserElementSnapshot, text: string) => Promise<void>;
}

export function ElementListPanel({
  elements,
  onTestClick,
  onTestType,
}: ElementListPanelProps): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = elements.find((e) => e.elementId === selectedId);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <p className="text-xs text-neutral-500 px-3 py-1 border-b border-neutral-800">
        Elements ({elements.length})
      </p>
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5 min-h-0">
        {elements.length === 0 ? (
          <p className="text-xs text-neutral-500 py-2">No elements — refresh snapshot</p>
        ) : (
          elements.slice(0, 80).map((el) => (
            <button
              key={el.elementId}
              type="button"
              className={`w-full text-left text-xs py-1 px-2 rounded border border-transparent ${
                selectedId === el.elementId
                  ? "bg-neutral-700 border-neutral-600"
                  : "hover:bg-neutral-800 text-neutral-400"
              }`}
              onClick={() => setSelectedId(el.elementId)}
            >
              <span className="text-neutral-300">{el.tagName}</span>
              {el.text && <span className="ml-1 truncate">"{el.text.slice(0, 40)}"</span>}
              {el.placeholder && (
                <span className="ml-1 text-neutral-500">ph:{el.placeholder}</span>
              )}
            </button>
          ))
        )}
      </div>
      {selected ? (
        <div className="border-t border-neutral-700 px-3 py-2 space-y-2 text-xs">
          <p className="text-neutral-300 font-medium">{selected.tagName}</p>
          {selected.selector && (
            <p className="font-mono text-neutral-500 break-all">{selected.selector}</p>
          )}
          <p className="text-neutral-500">
            frame: {selected.frameId} · visible: {String(selected.visible)} · enabled:{" "}
            {String(selected.enabled)}
          </p>
          <p className="text-neutral-500 font-mono">
            rect: {Math.round(selected.rectInMainFrame.x)},
            {Math.round(selected.rectInMainFrame.y)} ·{" "}
            {Math.round(selected.rectInMainFrame.width)}×
            {Math.round(selected.rectInMainFrame.height)}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
              onClick={() => void onTestClick(selected)}
            >
              <MousePointer2 size={12} />
              Test Click
            </button>
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
              onClick={() => void onTestType(selected, "test-input")}
            >
              <Keyboard size={12} />
              Test Type
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
