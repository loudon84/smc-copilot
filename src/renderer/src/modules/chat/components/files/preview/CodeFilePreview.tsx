import type { FilePreviewState } from "../../../hooks/files/useFilePreview";
import { CodeBlock } from "../../rich-content";

export function CodeFilePreview({
  state,
}: {
  state: FilePreviewState;
}): React.JSX.Element {
  const language = state.descriptor?.language;
  return (
    <div className="file-preview-code">
      <CodeBlock className={language ? `language-${language}` : undefined}>
        {state.descriptor?.content || ""}
      </CodeBlock>
    </div>
  );
}
