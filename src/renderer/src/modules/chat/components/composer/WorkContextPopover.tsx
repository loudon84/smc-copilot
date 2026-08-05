/**
 * Presentational shell for Work context popover contents.
 * Screens inject Expert/Skill/Permission selectors as children.
 */
export function WorkContextPopover({
  children,
  onClear,
}: {
  children: React.ReactNode;
  onClear?: () => void;
}): React.JSX.Element {
  return (
    <div className="work-context-popover-body">
      <div className="work-context-popover-title">Work Context</div>
      <div className="work-context-popover-content">{children}</div>
      {onClear ? (
        <button
          type="button"
          className="work-context-popover-clear"
          onClick={onClear}
        >
          Clear Context
        </button>
      ) : null}
    </div>
  );
}
