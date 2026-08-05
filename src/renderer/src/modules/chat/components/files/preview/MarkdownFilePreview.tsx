import type { FilePreviewState } from "../../../hooks/files/useFilePreview";
import { RichContentRenderer } from "../../rich-content";

export function MarkdownFilePreview({
  state,
}: {
  state: FilePreviewState;
}): React.JSX.Element {
  return (
    <div className="file-preview-markdown">
      <RichContentRenderer
        content={state.descriptor?.content || ""}
        streaming={false}
      />
    </div>
  );
}
