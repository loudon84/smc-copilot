import { RichContentRenderer } from "../../rich-content/RichContentRenderer";

export interface MessageDocumentPreviewProps {
  title: string;
  markdown: string;
}

/**
 * In-memory Markdown preview for an Assistant Message document (no fileId yet).
 */
// @lat: [[file-ui-components#Message document preview]]
export function MessageDocumentPreview(
  props: MessageDocumentPreviewProps,
): React.JSX.Element {
  return (
    <div className="message-document-preview">
      <RichContentRenderer
        content={props.markdown}
        contentType="markdown"
        streaming={false}
        sourceId={`message-doc:${props.title}`}
      />
    </div>
  );
}

export default MessageDocumentPreview;
