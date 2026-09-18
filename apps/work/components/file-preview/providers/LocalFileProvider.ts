import type {
  FilePreviewProvider,
  FilePreviewSource,
  FileProviderResolveOptions,
  FileProviderResult,
} from "../types";
import {
  fileFromPreviewDescriptor,
  type PreviewDescriptorLike,
} from "./descriptor-to-file";

export type LocalFileProviderDeps = {
  getPreview?: (
    fileId: string,
  ) => Promise<PreviewDescriptorLike | { error: { message: string } }>;
};

function defaultGetPreview(
  fileId: string,
): Promise<PreviewDescriptorLike | { error: { message: string } }> {
  const filesApi = (
    globalThis as {
      hermesAPI?: {
        files?: {
          getPreview?: (
            profile: string | undefined,
            fileId: string,
          ) => Promise<PreviewDescriptorLike | { error: { message: string } }>;
        };
      };
    }
  ).hermesAPI?.files;
  if (!filesApi?.getPreview) {
    return Promise.reject(new Error("FILES_PREVIEW_UNAVAILABLE"));
  }
  return filesApi.getPreview(undefined, fileId);
}

/**
 * Local managed-file preview via existing files IPC (id = ManagedFile id).
 * Renderer never reads `source.path` from disk.
 */
export function createLocalFileProvider(
  deps: LocalFileProviderDeps = {},
): FilePreviewProvider {
  const getPreview = deps.getPreview ?? defaultGetPreview;

  return {
    async resolve(
      source: FilePreviewSource,
      options?: FileProviderResolveOptions,
    ): Promise<FileProviderResult> {
      if (source.type !== "local") {
        return { ok: false, reason: "error", message: "SOURCE_TYPE_MISMATCH" };
      }
      try {
        options?.onPhase?.("prepare");
        const result = await getPreview(source.id);
        if (result && "error" in result) {
          return {
            ok: false,
            reason: "error",
            message: result.error.message,
          };
        }
        const resolved = await fileFromPreviewDescriptor(result, source.name);
        return { ok: true, resolved };
      } catch (error) {
        return {
          ok: false,
          reason: "error",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

export const LocalFileProvider = createLocalFileProvider();
