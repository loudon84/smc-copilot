import type { FilePreviewState } from "../../../hooks/files/useFilePreview";

export function CodeFilePreview({
  state,
}: {
  state: FilePreviewState;
}): React.JSX.Element {
  const language = state.descriptor?.language;
  return (
    <div className="file-preview-code">
      <pre className={language ? `language-${language}` : undefined}>
        <code>{state.descriptor?.content || ""}</code>
      </pre>
    </div>
  );
}
