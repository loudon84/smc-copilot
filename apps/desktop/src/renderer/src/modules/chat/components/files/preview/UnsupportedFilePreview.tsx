import type { FilePreviewState } from "../../../hooks/files/useFilePreview";

export function UnsupportedFilePreview({
  state,
}: {
  state: FilePreviewState;
}): React.JSX.Element {
  return (
    <div className="file-preview-unsupported">
      <p>
        {state.descriptor?.unsupportedReason ||
          "Preview isn't available for this file."}
      </p>
    </div>
  );
}
