import { useState } from "react";
import { Camera } from "lucide-react";

interface ScreenshotPanelProps {
  className?: string;
}

export function ScreenshotPanel({ className }: ScreenshotPanelProps) {
  const [base64, setBase64] = useState<string | null>(null);
  const [screenshotId, setScreenshotId] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capture = async () => {
    setIsCapturing(true);
    setError(null);
    try {
      const result = await window.aiosBrowser.screenshotV2({ base64: true, persist: true });
      if (result?.base64) {
        setBase64(result.base64);
        setScreenshotId(result.screenshotId);
      } else {
        setError("Screenshot failed");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className={`flex flex-col min-h-0 ${className ?? ""}`}>
      <div className="px-3 py-2 border-b border-neutral-700 flex items-center justify-between shrink-0">
        <h3 className="text-sm font-medium text-neutral-300">Screenshot</h3>
        <button
          type="button"
          onClick={() => void capture()}
          disabled={isCapturing}
          className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200"
          title="Capture viewport"
        >
          <Camera size={14} className={isCapturing ? "animate-pulse" : ""} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
        {screenshotId && (
          <p className="text-xs text-neutral-500 mb-2 font-mono truncate">{screenshotId}</p>
        )}
        {base64 ? (
          <img
            src={`data:image/png;base64,${base64}`}
            alt="Screenshot"
            className="w-full rounded border border-neutral-700"
          />
        ) : (
          <p className="text-xs text-neutral-500">No screenshot captured</p>
        )}
      </div>
    </div>
  );
}
