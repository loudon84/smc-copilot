import { useCallback, useMemo, useState } from "react";
import { Keyboard, MousePointer2, Search } from "lucide-react";
import type { BrowserElementSnapshot } from "../../../../../shared/browser/browser-snapshot-contract";

export interface PageSelectorActionBarProps {
  selectedFrameId: string | null;
}

export function PageSelectorActionBar({
  selectedFrameId,
}: PageSelectorActionBarProps): React.JSX.Element {
  const [selector, setSelector] = useState("");
  const [typeText, setTypeText] = useState("test-input");
  const [clearFirst, setClearFirst] = useState(true);
  const [running, setRunning] = useState(false);
  const [found, setFound] = useState<BrowserElementSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = useMemo(() => selector.trim(), [selector]);
  const canRun = Boolean(selectedFrameId) && Boolean(trimmed) && !running;

  const find = useCallback(async (): Promise<void> => {
    if (!canRun) return;
    setRunning(true);
    setError(null);
    try {
      const res = await window.aiosBrowser.findElement({
        selector: trimmed,
        frame: { frameId: selectedFrameId ?? "" },
      });
      setFound(res);
      if (!res) setError("Element not found");
    } finally {
      setRunning(false);
    }
  }, [canRun, selectedFrameId, trimmed]);

  const testClick = useCallback(async (): Promise<void> => {
    if (!canRun) return;
    setRunning(true);
    setError(null);
    try {
      await window.aiosBrowser.clickElement({
        selector: trimmed,
        frame: { frameId: selectedFrameId ?? "" },
      });
    } finally {
      setRunning(false);
    }
  }, [canRun, selectedFrameId, trimmed]);

  const testType = useCallback(async (): Promise<void> => {
    if (!canRun) return;
    setRunning(true);
    setError(null);
    try {
      await window.aiosBrowser.typeElement(
        {
          selector: trimmed,
          frame: { frameId: selectedFrameId ?? "" },
        },
        typeText,
        { clear: clearFirst },
      );
    } finally {
      setRunning(false);
    }
  }, [canRun, clearFirst, selectedFrameId, trimmed, typeText]);

  return (
    <div className="border-b border-neutral-800 shrink-0">
      <div className="px-3 py-2 flex items-center gap-2">
        <Search size={14} className="text-neutral-500 shrink-0" />
        <input
          value={selector}
          onChange={(e) => setSelector(e.target.value)}
          placeholder='Selector (e.g. "#submitBtn", "button[data-action=\\"save\\"]")'
          className="flex-1 min-w-0 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 placeholder:text-neutral-600"
        />
        <button
          type="button"
          disabled={!canRun}
          onClick={() => void find()}
          className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-200 disabled:opacity-50 disabled:hover:bg-neutral-700 text-xs"
          title="Find"
        >
          {running ? "…" : "Find"}
        </button>
        <button
          type="button"
          disabled={!canRun}
          onClick={() => void testClick()}
          className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-200 disabled:opacity-50 disabled:hover:bg-neutral-700 text-xs"
          title="Test Click"
        >
          <MousePointer2 size={12} />
          {running ? "Clicking…" : "Click"}
        </button>
      </div>

      <div className="px-3 pb-2 flex items-center gap-2">
        <Keyboard size={14} className="text-neutral-500 shrink-0" />
        <input
          value={typeText}
          onChange={(e) => setTypeText(e.target.value)}
          placeholder="Text"
          className="flex-1 min-w-0 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 placeholder:text-neutral-600"
        />
        <label className="flex items-center gap-1 text-xs text-neutral-400 select-none">
          <input
            type="checkbox"
            checked={clearFirst}
            onChange={(e) => setClearFirst(e.target.checked)}
          />
          clear
        </label>
        <button
          type="button"
          disabled={!canRun}
          onClick={() => void testType()}
          className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-200 disabled:opacity-50 disabled:hover:bg-neutral-700 text-xs"
          title="Test Type"
        >
          {running ? "Typing…" : "Type"}
        </button>
      </div>

      {error ? <p className="px-3 pb-2 text-xs text-rose-400">{error}</p> : null}
      {found ? (
        <p className="px-3 pb-2 text-[11px] text-neutral-500">
          Found: <span className="text-neutral-300">{found.tagName}</span>
          {found.text ? <span className="ml-1">“{found.text.slice(0, 40)}”</span> : null}
          {found.selector ? <span className="ml-1 font-mono">{found.selector}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

