import { detectFormat } from "../registry/file-detector";
import type { ResolvedPreviewFile } from "../types";

/** Subset of File Platform preview descriptor needed to build a browser File. */
export type PreviewDescriptorLike = {
  title: string;
  mime: string;
  content?: string;
  localUrl?: string;
};

/**
 * Turn a File Platform preview descriptor into a browser File for open-file-viewer.
 */
export async function fileFromPreviewDescriptor(
  descriptor: PreviewDescriptorLike,
  fallbackName: string,
): Promise<ResolvedPreviewFile> {
  const fileName = descriptor.title || fallbackName || "preview.bin";
  const mime = descriptor.mime || "application/octet-stream";
  const format = detectFormat({ name: fileName, mime });

  if (descriptor.localUrl) {
    // Electron renderer CSP blocks fetch(file://). Binary previews must use
    // hermes-file-preview:// (or http/https/blob).
    if (/^file:/i.test(descriptor.localUrl)) {
      throw new Error("PREVIEW_FILE_URL_BLOCKED");
    }
    const response = await fetch(descriptor.localUrl);
    if (!response.ok) {
      throw new Error(`PREVIEW_FETCH_FAILED ${response.status}`);
    }
    const blob = await response.blob();
    const file = new File([blob], fileName, {
      type: blob.type || mime,
    });
    return { file, fileName, mime: file.type || mime, format };
  }

  if (typeof descriptor.content === "string") {
    const file = new File([descriptor.content], fileName, { type: mime });
    return { file, fileName, mime, format };
  }

  throw new Error("PREVIEW_EMPTY_DESCRIPTOR");
}
