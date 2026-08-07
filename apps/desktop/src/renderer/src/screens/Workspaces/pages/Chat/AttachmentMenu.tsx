import { useEffect, useRef, useState } from "react";
import { ChevronDown, Paperclip } from "lucide-react";
import { useI18n } from "../../../../components/useI18n";

export function AttachmentMenu({
  disabled,
  onUpload,
}: {
  disabled?: boolean;
  onUpload: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="workspaces-webchat-attach-menu" ref={ref}>
      <button
        type="button"
        className="workspaces-webchat-icon-btn"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={t("workspaces.chat.attach", { defaultValue: "Attach files" })}
      >
        <Paperclip size={16} />
        <ChevronDown size={10} />
      </button>
      {open && (
        <div className="workspaces-webchat-attach-dropdown">
          <button
            type="button"
            onClick={() => {
              onUpload();
              setOpen(false);
            }}
          >
            {t("workspaces.chat.chooseFiles", { defaultValue: "Choose files…" })}
          </button>
          <button type="button" disabled>
            {t("workspaces.chat.pasteUpload", { defaultValue: "Paste upload (soon)" })}
          </button>
        </div>
      )}
    </div>
  );
}
