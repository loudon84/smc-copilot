import { memo } from "react";
import { RichContentRenderer } from "./rich-content";

/**
 * Compatibility entry for Discover / Skills / MessageRow. All markdown
 * rendering lives in [[RichContentRenderer]]; this wrapper keeps the
 * historical `children: string` API stable.
 */
const AgentMarkdown = memo(function AgentMarkdown({
  children,
  streaming = false,
}: {
  children: string;
  /** When true, incomplete fences stay inert (no Mermaid/SVG/Artifact run). */
  streaming?: boolean;
}): React.JSX.Element {
  return <RichContentRenderer content={children} streaming={streaming} />;
});

export { AgentMarkdown };
export default AgentMarkdown;
