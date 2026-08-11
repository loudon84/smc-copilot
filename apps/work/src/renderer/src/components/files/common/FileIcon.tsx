import {
  BookOpen,
  File,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileType,
  Image,
  Presentation,
} from "lucide-react";
import { classifyFileCategory, type ManagedFileCategory } from "../../../../../shared/files";

type IconComponent = React.ComponentType<{
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

const ICON_BY_CATEGORY: Record<ManagedFileCategory, IconComponent> = {
  image: Image,
  text: FileText,
  markdown: FileText,
  code: FileCode,
  pdf: FileText,
  office: FileType,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  epub: BookOpen,
  archive: FileArchive,
  html: FileCode,
  unknown: File,
};

export interface FileIconProps {
  /** Explicit category, when already known (e.g. from a ManagedFileView). */
  category?: ManagedFileCategory;
  /** Filename — used to classify when `category` is not provided. */
  name?: string;
  mime?: string;
  size?: number;
  className?: string;
}

/** Resolves a lucide icon by ManagedFileCategory, falling back to
 * classifying from the filename/mime when no category is given. */
export function FileIcon({
  category,
  name,
  mime,
  size = 16,
  className,
}: FileIconProps): React.JSX.Element {
  const resolved = category ?? classifyFileCategory(name ?? "", mime);
  const Icon = ICON_BY_CATEGORY[resolved] ?? File;
  return <Icon size={size} className={className} aria-hidden="true" />;
}

export default FileIcon;
