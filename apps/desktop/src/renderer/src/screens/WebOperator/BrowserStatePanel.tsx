import { useBrowserRuntimeState } from "./hooks/use-browser-runtime-state";
import { useBrowserState } from "./hooks/use-browser-state";
import { RefreshCw } from "lucide-react";

interface BrowserStatePanelProps {
  className?: string;
}

export function BrowserStatePanel({ className }: BrowserStatePanelProps) {
  const { runtimeState, isLoading: runtimeLoading, error: runtimeError, refresh: refreshRuntime } =
    useBrowserRuntimeState();
  const { state, isLoading: pageLoading, error: pageError, refresh: refreshPage } =
    useBrowserState();

  const isLoading = runtimeLoading || pageLoading;
  const refresh = () => {
    void refreshRuntime();
    void refreshPage();
  };

  return (
    <div className={`flex flex-col h-full ${className ?? ""}`}>
      <div className="px-3 py-2 border-b border-neutral-700 flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-300">Page State</h3>
        <button
          type="button"
          onClick={refresh}
          disabled={isLoading}
          className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200"
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {(runtimeError || pageError) && (
          <p className="text-xs text-red-400">{runtimeError ?? pageError}</p>
        )}

        {runtimeState ? (
          <div className="space-y-2 text-xs">
            <div className="flex flex-wrap gap-2">
              <span
                className={`px-1.5 py-0.5 rounded ${
                  runtimeState.loading ? "bg-amber-900/40 text-amber-300" : "bg-green-900/40 text-green-300"
                }`}
              >
                {runtimeState.loading ? "loading" : "idle"}
              </span>
              <span className="text-neutral-500">
                frames: {runtimeState.frameCount}
              </span>
              <span className={runtimeState.canGoBack ? "text-neutral-300" : "text-neutral-600"}>
                ← back
              </span>
              <span className={runtimeState.canGoForward ? "text-neutral-300" : "text-neutral-600"}>
                forward →
              </span>
            </div>
            <div>
              <p className="text-neutral-500 mb-0.5">Title</p>
              <p className="text-sm text-neutral-200">{runtimeState.title || "—"}</p>
            </div>
            <div>
              <p className="text-neutral-500 mb-0.5">URL</p>
              <p className="text-xs text-neutral-300 break-all">{runtimeState.url || "—"}</p>
            </div>
          </div>
        ) : null}

        {state ? (
          <>
            {state.inputs.length > 0 && (
              <div>
                <p className="text-xs text-neutral-500 mb-1">Inputs ({state.inputs.length})</p>
                {state.inputs.slice(0, 15).map((el, i) => (
                  <div key={i} className="text-xs text-neutral-400 py-0.5 border-b border-neutral-800">
                    <span className="text-neutral-300">
                      {el.selectorHint ?? el.name ?? el.id ?? `input[${i}]`}
                    </span>
                    {el.type && <span className="ml-1 text-neutral-500">({el.type})</span>}
                  </div>
                ))}
              </div>
            )}

            {state.buttons.length > 0 && (
              <div>
                <p className="text-xs text-neutral-500 mb-1">Buttons ({state.buttons.length})</p>
                {state.buttons.slice(0, 15).map((el, i) => (
                  <div key={i} className="text-xs text-neutral-400 py-0.5 border-b border-neutral-800">
                    <span className="text-neutral-300">
                      {el.text ?? el.selectorHint ?? `button[${i}]`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          !runtimeError &&
          !pageError &&
          !isLoading && <p className="text-xs text-neutral-500">No page loaded</p>
        )}
      </div>
    </div>
  );
}
