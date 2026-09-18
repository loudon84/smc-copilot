import { detectFormat } from "../registry/file-detector";
import type {
  FilePreviewProvider,
  FilePreviewSource,
  FileProviderResolveOptions,
  FileProviderResult,
} from "../types";

export type HttpFileProviderDeps = {
  fetchImpl?: typeof fetch;
};

/**
 * Remote URL → File via fetch (no OFV import).
 */
export function createHttpFileProvider(
  deps: HttpFileProviderDeps = {},
): FilePreviewProvider {
  const fetchImpl = deps.fetchImpl ?? fetch;

  return {
    async resolve(
      source: FilePreviewSource,
      options?: FileProviderResolveOptions,
    ): Promise<FileProviderResult> {
      if (source.type !== "url") {
        return { ok: false, reason: "error", message: "SOURCE_TYPE_MISMATCH" };
      }
      const url = source.url;
      if (!url) {
        return { ok: false, reason: "unavailable", message: "URL_MISSING" };
      }
      try {
        options?.onPhase?.("download");
        const response = await fetchImpl(url);
        if (!response.ok) {
          return {
            ok: false,
            reason: "error",
            message: `HTTP_${response.status}`,
          };
        }
        options?.onPhase?.("prepare");
        const blob = await response.blob();
        const mime =
          source.mime || blob.type || "application/octet-stream";
        const fileName = source.name || url.split("/").pop() || "download.bin";
        const file = new File([blob], fileName, { type: mime });
        return {
          ok: true,
          resolved: {
            file,
            fileName,
            mime,
            format: detectFormat({ name: fileName, mime }),
          },
        };
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

export const HttpFileProvider = createHttpFileProvider();
