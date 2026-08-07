import type { FilePreviewState } from "../../../hooks/files/useFilePreview";

export function ImageFilePreview({
  state,
}: {
  state: FilePreviewState;
}): React.JSX.Element {
  const descriptor = state.descriptor;
  return (
    <div className="file-preview-image-container">
      <img
        src={descriptor?.localUrl}
        alt={descriptor?.title || "Image preview"}
        className="file-preview-image"
      />
    </div>
  );
}
