import type { FilePreviewState } from "../../../hooks/files/useFilePreview";
import { AgentMarkdown } from "@renderer/components/AgentMarkdown";

export function MarkdownFilePreview({
  state,
}: {
  state: FilePreviewState;
}): React.JSX.Element {
  return (
    <div className="file-preview-markdown">
      <AgentMarkdown>{state.descriptor?.content || ""}</AgentMarkdown>
    </div>
  );
}
