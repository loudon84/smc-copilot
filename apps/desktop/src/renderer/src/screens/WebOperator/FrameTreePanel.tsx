import type { BrowserFrameSnapshot } from "../../../../shared/browser/browser-frame-contract";

interface FrameTreePanelProps {
  frames: BrowserFrameSnapshot[];
  selectedFrameId: string | null;
  onSelectFrame: (frameId: string) => void;
  errors?: Array<{ frameId: string; message: string }>;
}

export function FrameTreePanel({
  frames,
  selectedFrameId,
  onSelectFrame,
  errors = [],
}: FrameTreePanelProps): React.JSX.Element {
  return (
    <div className="flex flex-col min-h-0">
      <p className="text-xs text-neutral-500 px-3 py-1 border-b border-neutral-800">
        Frames ({frames.length})
      </p>
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5 max-h-40">
        {frames.length === 0 ? (
          <p className="text-xs text-neutral-500 py-2">No frames</p>
        ) : (
          frames.map((frame) => (
            <button
              key={frame.frameId}
              type="button"
              className={`w-full text-left text-xs py-1 px-2 rounded truncate ${
                selectedFrameId === frame.frameId
                  ? "bg-neutral-700 text-neutral-100"
                  : "text-neutral-400 hover:bg-neutral-800"
              }`}
              style={{ paddingLeft: `${8 + frame.depth * 12}px` }}
              onClick={() => onSelectFrame(frame.frameId)}
              title={frame.url}
            >
              <span className="font-mono text-neutral-500">d{frame.depth}</span>{" "}
              {frame.name || frame.url.slice(0, 48) || frame.frameId}
            </button>
          ))
        )}
        {errors.map((e) => (
          <p key={e.frameId} className="text-xs text-amber-500 px-2 py-0.5">
            {e.frameId}: {e.message}
          </p>
        ))}
      </div>
    </div>
  );
}
