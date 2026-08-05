import type { FilePreviewState } from "../../../hooks/files/useFilePreview";
import { CodeFilePreview } from "./CodeFilePreview";
import { ImageFilePreview } from "./ImageFilePreview";
import { MarkdownFilePreview } from "./MarkdownFilePreview";
import { PdfFilePreview } from "./PdfFilePreview";
import { TextFilePreview } from "./TextFilePreview";
import { UnsupportedFilePreview } from "./UnsupportedFilePreview";

/** Routes a preview descriptor to the matching body component. */
export function FilePreviewRouter({
  state,
  onLoadMore,
}: {
  state: FilePreviewState;
  onLoadMore?: () => void;
}): React.JSX.Element {
  if (state.loading) {
    return <div className="file-preview-loading">Loading preview…</div>;
  }
  const { descriptor } = state;
  if (!descriptor) {
    return <div className="file-preview-loading">No preview available.</div>;
  }

  switch (descriptor.type) {
    case "image":
      return <ImageFilePreview state={state} />;
    case "pdf":
      return <PdfFilePreview state={state} />;
    case "markdown":
      return <MarkdownFilePreview state={state} />;
    case "code":
      return <CodeFilePreview state={state} />;
    case "text":
    case "html":
    case "office":
      return <TextFilePreview state={state} onLoadMore={onLoadMore} />;
    case "unsupported":
    default:
      return <UnsupportedFilePreview state={state} />;
  }
}
