import { type ReactElement } from "react";

export function KnowledgeBaseDeleteConfirm(props: {
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
  cancelLabel: string;
  confirmLabel: string;
}): ReactElement {
  return (
    <div className="knowledge-toolbar" data-testid="knowledge-base-delete-confirm">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={props.submitting}
        onClick={props.onCancel}
      >
        {props.cancelLabel}
      </button>
      <button
        type="button"
        className="btn btn-sm"
        data-testid="knowledge-base-delete-confirm-submit"
        disabled={props.submitting}
        onClick={props.onConfirm}
      >
        {props.confirmLabel}
      </button>
    </div>
  );
}
