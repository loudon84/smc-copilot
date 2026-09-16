import { type ReactElement } from "react";
import { Button } from "../../../../../components/ui/Button";

export function KnowledgeBaseDeleteConfirm(props: {
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
  cancelLabel: string;
  confirmLabel: string;
}): ReactElement {
  return (
    <div className="knowledge-toolbar" data-testid="knowledge-base-delete-confirm">
      <Button size="sm" disabled={props.submitting} onClick={props.onCancel}>
        {props.cancelLabel}
      </Button>
      <Button
        size="sm"
        variant="danger"
        data-testid="knowledge-base-delete-confirm-submit"
        disabled={props.submitting}
        onClick={props.onConfirm}
      >
        {props.confirmLabel}
      </Button>
    </div>
  );
}
