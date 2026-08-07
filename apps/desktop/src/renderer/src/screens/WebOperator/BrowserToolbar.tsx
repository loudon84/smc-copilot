import { useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, RotateCw, Globe, ShieldCheck, ShieldX, ScanSearch } from "lucide-react";
import { useBrowserActions } from "./hooks/use-browser-actions";

interface BrowserToolbarProps {
  onNavigate?: (url: string) => void;
  onRefreshSnapshot?: () => void;
  currentUrl?: string;
  isDomainAllowed?: boolean;
  snapshotLoading?: boolean;
}

export function BrowserToolbar({
  onNavigate,
  onRefreshSnapshot,
  currentUrl = "",
  isDomainAllowed,
  snapshotLoading = false,
}: BrowserToolbarProps) {
  const [url, setUrl] = useState(currentUrl);
  const actions = useBrowserActions();

  const handleNavigate = async () => {
    if (!url.trim()) return;
    const result = await actions.open(url.trim());
    if (result.ok && onNavigate) {
      onNavigate(url.trim());
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleNavigate();
  };

  return (
    <div className="browser-toolbar" role="toolbar" aria-label="Browser navigation">
      <div className="browser-toolbar__nav">
        <button
          type="button"
          onClick={() => actions.back()}
          className="browser-toolbar__icon-btn"
          title="Back"
        >
          <ArrowLeft size={16} />
        </button>
        <button
          type="button"
          onClick={() => actions.forward()}
          className="browser-toolbar__icon-btn"
          title="Forward"
        >
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          onClick={() => actions.reload()}
          className="browser-toolbar__icon-btn"
          title="Reload"
        >
          <RotateCw size={16} />
        </button>
      </div>

      <div className="browser-toolbar__url">
        <Globe size={14} className="browser-toolbar__url-icon" aria-hidden />
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter URL..."
          className="browser-toolbar__url-input"
          spellCheck={false}
        />
        {isDomainAllowed !== undefined &&
          (isDomainAllowed ? (
            <ShieldCheck size={14} className="browser-toolbar__shield browser-toolbar__shield--ok" />
          ) : (
            <ShieldX size={14} className="browser-toolbar__shield browser-toolbar__shield--blocked" />
          ))}
      </div>

      {onRefreshSnapshot ? (
        <button
          type="button"
          onClick={onRefreshSnapshot}
          disabled={snapshotLoading}
          className="browser-toolbar__icon-btn"
          title="Refresh Snapshot"
        >
          <ScanSearch size={16} className={snapshotLoading ? "animate-pulse" : ""} />
        </button>
      ) : null}

      <button
        type="button"
        onClick={handleNavigate}
        disabled={actions.isLoading}
        className="browser-toolbar__open"
      >
        Open
      </button>
    </div>
  );
}
