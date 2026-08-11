import type { ManagedFileCategory } from "../../../../../shared/files";
import { formatFileSize } from "../composer/file-card-utils";

export interface FileBadgeProps {
  /** Extension without the leading dot (e.g. "pdf"); preferred label source. */
  extension?: string;
  category?: ManagedFileCategory;
  /** Byte size — appended after a separator when provided. */
  size?: number;
  className?: string;
}

/** Small "TYPE · SIZE" badge shown on composer/message attachment cards. */
export function FileBadge({
  extension,
  category,
  size,
  className,
}: FileBadgeProps): React.JSX.Element {
  const label = (extension || category || "file").toUpperCase();
  const sizeLabel = size !== undefined ? formatFileSize(size) : "";
  return (
    <span className={`file-badge${className ? ` ${className}` : ""}`}>
      {label}
      {sizeLabel && <span className="file-badge-size"> · {sizeLabel}</span>}
    </span>
  );
}

export default FileBadge;
