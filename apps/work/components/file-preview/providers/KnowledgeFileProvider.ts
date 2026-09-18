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

export type KnowledgeResolveDocumentPreviewInput = {
  sourceFileId: string;
  activeVersionId?: string | null;
  forceRefresh?: boolean;
  fileName?: string | null;
  mimeType?: string | null;
};

export type KnowledgeFileProviderDeps = {
  resolveDocumentPreview?: (
    input: KnowledgeResolveDocumentPreviewInput,
  ) => Promise<{ managedFileId: string }>;
  getPreview?: (
    fileId: string,
  ) => Promise<PreviewDescriptorLike | { error: { message: string } }>;
  /** Test hook: skip getPreview after resolve; empty File stub for viewer. */
  probeLoad?: (
    managedFileId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  resolveManagedFileId?: (source: FilePreviewSource) => string | null;
};

function defaultResolveDocumentPreview(
  input: KnowledgeResolveDocumentPreviewInput,
): Promise<{ managedFileId: string }> {
  const bases = (
    globalThis as {
      hermesAPI?: {
        knowledgeJobs?: {
          bases?: {
            resolveDocumentPreview?: (
              input: KnowledgeResolveDocumentPreviewInput,
            ) => Promise<{ managedFileId: string }>;
          };
        };
      };
    }
  ).hermesAPI?.knowledgeJobs?.bases;
  if (!bases?.resolveDocumentPreview) {
    return Promise.reject(new Error("KNOWLEDGE_UNAVAILABLE"));
  }
  return bases.resolveDocumentPreview(input);
}

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
 * Knowledge source → ManagedFile materialize (existing Main bridge) → File.
 * Must not import @open-file-viewer.
 */
export function createKnowledgeFileProvider(
  deps: KnowledgeFileProviderDeps = {},
): FilePreviewProvider {
  return {
    async resolve(
      source: FilePreviewSource,
      options?: FileProviderResolveOptions,
    ): Promise<FileProviderResult> {
      if (source.type !== "knowledge") {
        return { ok: false, reason: "error", message: "SOURCE_TYPE_MISMATCH" };
      }
      try {
        let managedFileId: string | null = null;
        options?.onPhase?.("download");
        if (deps.resolveManagedFileId) {
          managedFileId = deps.resolveManagedFileId(source);
        } else {
          const resolve =
            deps.resolveDocumentPreview ?? defaultResolveDocumentPreview;
          const resolved = await resolve({
            sourceFileId: source.id,
            activeVersionId: source.activeVersionId,
            forceRefresh: options?.forceRefresh,
            fileName: source.name,
            mimeType: source.mime,
          });
          managedFileId = resolved.managedFileId;
        }

        if (!managedFileId) {
          return { ok: false, reason: "unavailable" };
        }

        options?.onPhase?.("prepare");

        if (deps.probeLoad) {
          const probe = await deps.probeLoad(managedFileId);
          if (!probe.ok) {
            return { ok: false, reason: "error", message: probe.error };
          }
          const stub = new File([""], source.name || "preview.bin", {
            type: source.mime || "application/octet-stream",
          });
          return {
            ok: true,
            resolved: {
              file: stub,
              fileName: source.name || "preview.bin",
              mime: source.mime,
              format: "txt",
            },
          };
        }

        const getPreview = deps.getPreview ?? defaultGetPreview;
        const result = await getPreview(managedFileId);
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
        const message =
          error instanceof Error ? error.message : String(error);
        const code = message.split(/\s/)[0] ?? message;
        if (
          code === "KNOWLEDGE_UNAVAILABLE" ||
          code === "KNOWLEDGE_NOT_FOUND" ||
          code === "unused"
        ) {
          return { ok: false, reason: "unavailable", message };
        }
        return { ok: false, reason: "error", message };
      }
    },
  };
}

export const KnowledgeFileProvider = createKnowledgeFileProvider();
