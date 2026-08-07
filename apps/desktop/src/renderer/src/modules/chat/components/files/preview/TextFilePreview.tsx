import type { FilePreviewState } from "../../../hooks/files/useFilePreview";

export function TextFilePreview({
  state,
  onLoadMore,
}: {
  state: FilePreviewState;
  onLoadMore?: () => void;
}): React.JSX.Element {
  const canLoadMore =
    !!onLoadMore &&
    state.descriptor?.truncated === true &&
    state.descriptor.nextOffset != null;

  return (
    <>
      {state.descriptor?.truncated && (
        <div className="file-preview-truncated">
          File preview truncated — showing a partial view.
          {canLoadMore && (
            <button
              type="button"
              className="file-preview-load-more"
              disabled={state.loadingMore}
              onClick={onLoadMore}
            >
              {state.loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
      <pre className="file-preview-text">{state.descriptor?.content}</pre>
    </>
  );
}
