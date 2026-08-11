/**
 * File UI component package — Composer/Message attachment presentation
 * built on top of the existing `Attachment` type. See
 * `lat.md/file-ui-components.md`.
 *
 * Layout (PRD v1.1):
 *   composer/  — tray, cards, picker, drop overlay, processing status
 *   message/   — read-only message attachment cards/grid
 *   preview/   — right-side preview panel + type routers
 *   common/    — shared icon/badge/menu/operation card
 */

export { FilePickerButton, type FilePickerButtonProps } from "./composer/FilePickerButton";
export {
  FileIcon,
  type FileIconProps,
} from "./common/FileIcon";
export { FileBadge, type FileBadgeProps } from "./common/FileBadge";
export {
  FileProcessingStatus,
  FileStatusIndicator,
  type FileProcessingStatusProps,
  type FileStatusIndicatorProps,
} from "./composer/FileProcessingStatus";
export {
  ComposerAttachmentCard,
  AttachmentItem,
  type ComposerAttachmentCardProps,
  type AttachmentItemProps,
} from "./composer/ComposerAttachmentCard";
export {
  ComposerAttachmentTray,
  AttachmentTray,
  type ComposerAttachmentTrayProps,
  type AttachmentTrayProps,
} from "./composer/ComposerAttachmentTray";
export {
  FileDropOverlay,
  FileDropZone,
  type FileDropOverlayProps,
  type FileDropZoneProps,
} from "./composer/FileDropOverlay";
export {
  MessageAttachmentGrid,
  type MessageAttachmentGridProps,
} from "./message/MessageAttachmentGrid";
export {
  MessageAttachmentCard,
  type MessageAttachmentCardProps,
} from "./message/MessageAttachmentCard";
export {
  MessageImageCard,
  type MessageImageCardProps,
} from "./message/MessageImageCard";
export {
  MessageDocumentActions,
  type MessageDocumentActionsProps,
} from "./message/MessageDocumentActions";
export {
  isDocumentLikeMessage,
  extractDocumentTitle,
} from "./message/document-message-utils";
export {
  FileContextMenu,
  type FileContextMenuProps,
} from "./common/FileContextMenu";
export {
  FileOperationCard,
  type FileOperationCardProps,
} from "./common/FileOperationCard";
export { FilePreviewPanel } from "./preview/FilePreviewPanel";
export {
  FilePreviewHeader,
  type FilePreviewHeaderProps,
} from "./preview/FilePreviewHeader";
export { FilePreviewError } from "./preview/FilePreviewError";
export {
  MessageDocumentPreview,
  type MessageDocumentPreviewProps,
} from "./preview/MessageDocumentPreview";
export { formatFileSize } from "./composer/file-card-utils";
export {
  AgentOutputFileCard,
  type AgentOutputFileCardProps,
} from "./message/AgentOutputFileCard";
