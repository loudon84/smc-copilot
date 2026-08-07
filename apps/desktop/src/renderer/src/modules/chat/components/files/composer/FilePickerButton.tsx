import { Paperclip } from "lucide-react";
import { useFilePicker, type UseFilePickerOptions } from "../../../hooks/files/useFilePicker";

export interface FilePickerButtonProps extends UseFilePickerOptions {
  onPicked?: (result: Awaited<ReturnType<ReturnType<typeof useFilePicker>["pick"]>>) => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  "aria-label"?: string;
}

/** Paperclip button that opens the native/managed file picker via useFilePicker. */
export function FilePickerButton({
  onPicked,
  disabled,
  title = "Attach files",
  className,
  "aria-label": ariaLabel = "Attach files",
  ...pickerOptions
}: FilePickerButtonProps): React.JSX.Element {
  const { pick, picking } = useFilePicker(pickerOptions);

  return (
    <button
      type="button"
      className={className}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled || picking}
      onClick={() => {
        void pick().then((result) => onPicked?.(result));
      }}
    >
      <Paperclip size={16} />
    </button>
  );
}

export default FilePickerButton;
