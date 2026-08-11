import { memo } from "react";
import { ContentErrorBoundary } from "./ContentErrorBoundary";
import { MarkdownRenderer } from "./markdown/MarkdownRenderer";

export interface RichContentRendererProps {
  content: string;
  streaming?: boolean;
  sourceId?: string;
  contentType?: "markdown";
}

/**
 * Unified rich-content markdown renderer: GFM, Diff, code collapse, and
 * routed Mermaid / SVG / HTML artifact fences. AgentMarkdown delegates here.
 */
const RichContentRenderer = memo(function RichContentRenderer({
  content,
  streaming = false,
  sourceId,
  contentType = "markdown",
}: RichContentRendererProps): React.JSX.Element {
  void contentType; // reserved for future non-markdown rich types

  return (
    <ContentErrorBoundary
      fallback={(message) => (
        <div className="rich-content-error">
          <p className="rich-content-error-msg">{message}</p>
          <pre className="chat-code-plain">{content}</pre>
        </div>
      )}
    >
      <MarkdownRenderer
        content={content}
        streaming={streaming}
        sourceId={sourceId}
      />
    </ContentErrorBoundary>
  );
});

export { RichContentRenderer };
export default RichContentRenderer;
