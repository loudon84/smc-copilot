import type { FilePreviewState } from "../../../hooks/files/useFilePreview";

export function PdfFilePreview({
  state,
}: {
  state: FilePreviewState;
}): React.JSX.Element {
  const descriptor = state.descriptor;
  return (
    <iframe
      src={descriptor?.localUrl}
      title={descriptor?.title || "PDF preview"}
      className="file-preview-pdf-frame"
    />
  );
}
