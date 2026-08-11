import { AlertTriangle, RotateCw } from "lucide-react";

interface FilePreviewErrorProps {
  message: string;
  onRetry: () => void;
}

/** Inline error state for a failed `files:get-preview` call. */
export function FilePreviewError({
  message,
  onRetry,
}: FilePreviewErrorProps): React.JSX.Element {
  return (
    <div className="file-preview-error">
      <AlertTriangle size={24} className="file-preview-error-icon" />
      <p className="file-preview-error-message">{message}</p>
      <button type="button" className="file-preview-retry-btn" onClick={onRetry}>
        <RotateCw size={13} />
        Retry
      </button>
    </div>
  );
}
