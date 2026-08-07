import { AgentMarkdown } from "@renderer/components/AgentMarkdown";

export interface MessageDocumentPreviewProps {
  title: string;
  markdown: string;
}

/** In-memory assistant message document preview (no ManagedFile yet). */
export function MessageDocumentPreview({
  title,
  markdown,
}: MessageDocumentPreviewProps): React.JSX.Element {
  return (
    <div className="message-document-preview">
      <div className="file-preview-message-doc-title">{title}</div>
      <AgentMarkdown>{markdown || ""}</AgentMarkdown>
    </div>
  );
}

export default MessageDocumentPreview;
