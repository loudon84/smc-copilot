import { useCallback, useEffect, useMemo } from "react";
import type {
  ConfirmDialogPayload,
  DialogDescriptor,
} from "./overlay-types";
import { useOverlayState } from "./useOverlayState";
import "./overlay-layer.css";

function isConfirmPayload(payload: unknown): payload is ConfirmDialogPayload {
  if (!payload || typeof payload !== "object") return false;
  return typeof (payload as ConfirmDialogPayload).message === "string";
}

interface DialogEntryProps {
  dialog: DialogDescriptor;
  onClose: (id: string, result?: unknown) => void;
  onDismiss: (id: string, reason?: unknown) => void;
}

function DialogEntry({
  dialog,
  onClose,
  onDismiss,
}: DialogEntryProps): React.JSX.Element {
  const handleBackdrop = useCallback((): void => {
    if (dialog.closeOnBackdrop) {
      onDismiss(dialog.id, new Error("Dismissed by backdrop"));
    }
  }, [dialog.closeOnBackdrop, dialog.id, onDismiss]);

  const payload = isConfirmPayload(dialog.payload) ? dialog.payload : null;

  const renderBody = (): React.JSX.Element => {
    if (
      (dialog.type === "confirm" || dialog.type === "danger-confirm") &&
      payload
    ) {
      const isDanger = dialog.type === "danger-confirm";
      return (
        <>
          {dialog.title ? (
            <h2 className="overlay-dialog-layer__title">{dialog.title}</h2>
          ) : null}
          <p className="overlay-dialog-layer__message">{payload.message}</p>
          <div className="overlay-dialog-layer__actions">
            <button
              type="button"
              className="overlay-dialog-layer__btn"
              onClick={() => onDismiss(dialog.id, new Error("Cancelled"))}
            >
              {payload.cancelLabel ?? "取消"}
            </button>
            <button
              type="button"
              className={
                isDanger
                  ? "overlay-dialog-layer__btn overlay-dialog-layer__btn--danger"
                  : "overlay-dialog-layer__btn overlay-dialog-layer__btn--primary"
              }
              onClick={() => onClose(dialog.id, true)}
            >
              {payload.confirmLabel ?? (isDanger ? "确认" : "确定")}
            </button>
          </div>
        </>
      );
    }

    return (
      <>
        {dialog.title ? (
          <h2 className="overlay-dialog-layer__title">{dialog.title}</h2>
        ) : null}
        <p className="overlay-dialog-layer__fallback">
          暂不支持此 Dialog 类型：{dialog.type}
        </p>
        <div className="overlay-dialog-layer__actions">
          <button
            type="button"
            className="overlay-dialog-layer__btn"
            onClick={() => onDismiss(dialog.id, new Error("Unsupported dialog"))}
          >
            关闭
          </button>
        </div>
      </>
    );
  };

  return (
    <div
      className="overlay-dialog-layer__entry"
      role="dialog"
      aria-modal="true"
      aria-labelledby={dialog.title ? `overlay-dialog-${dialog.id}` : undefined}
    >
      {dialog.closeOnBackdrop ? (
        <button
          type="button"
          className="overlay-dialog-layer__backdrop"
          aria-label="Close dialog"
          onClick={handleBackdrop}
        />
      ) : (
        <div className="overlay-dialog-layer__backdrop" aria-hidden />
      )}
      <div
        className="overlay-dialog-layer__panel"
        id={dialog.title ? `overlay-dialog-${dialog.id}` : undefined}
      >
        {renderBody()}
      </div>
    </div>
  );
}

/** Global dialog stack mount — z-index 60, above DrawerLayer. */
export function DialogLayer(): React.JSX.Element | null {
  const { dialogs, dialogApi } = useOverlayState();
  const topDialog = useMemo(
    () => (dialogs.length > 0 ? dialogs[dialogs.length - 1] : null),
    [dialogs],
  );

  useEffect(() => {
    if (!topDialog?.closeOnEsc) return undefined;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      dialogApi.dismiss(topDialog.id, new Error("Dismissed by Escape"));
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [topDialog, dialogApi]);

  if (dialogs.length === 0) return null;

  return (
    <div className="overlay-dialog-layer" data-overlay-layer="dialog">
      {dialogs.map((dialog) => (
        <DialogEntry
          key={dialog.id}
          dialog={dialog}
          onClose={dialogApi.close}
          onDismiss={dialogApi.dismiss}
        />
      ))}
    </div>
  );
}
