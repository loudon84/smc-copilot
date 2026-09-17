import { type ReactElement } from "react";
import { Button } from "@/components/ui/button";

export function KnowledgeBaseDeleteConfirm(props: {
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
  cancelLabel: string;
  confirmLabel: string;
}): ReactElement {
  return (
    <div className="flex justify-end gap-2" data-testid="knowledge-base-delete-confirm">
      <Button
        type="button"
        variant="outline"
        disabled={props.submitting}
        onClick={props.onCancel}
      >
        {props.cancelLabel}
      </Button>
      <Button
        type="button"
        variant="destructive"
        data-testid="knowledge-base-delete-confirm-submit"
        disabled={props.submitting}
        onClick={props.onConfirm}
      >
        {props.confirmLabel}
      </Button>
    </div>
  );
}
