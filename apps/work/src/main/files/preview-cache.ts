import { existsSync, rmSync } from "fs";
import { join } from "path";
import { ensureFilesLayout } from "./file-store";

function cleanupPath(path: string): void {
  if (existsSync(path)) {
    try {
      rmSync(path, { force: true });
    } catch {
      /* ignore */
    }
  }
}

/** Preview-cache path under files/previews keyed by remote identity (+ hash). */
export function resolvePreviewCachePath(input: {
  profile?: string;
  provider: string;
  remoteArtifactId: string;
  remoteRunId?: string;
  contentHash?: string;
}): string {
  const layout = ensureFilesLayout(
    input.profile && input.profile !== "default" ? input.profile : undefined,
  );
  const key = [
    input.provider,
    input.remoteRunId || "norun",
    input.remoteArtifactId,
    input.contentHash?.slice(0, 16) || "nohash",
  ].join("_");
  const safe = key.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 180);
  return join(layout.previews, `remote_${safe}`);
}

export function invalidatePreviewCache(input: {
  profile?: string;
  provider: string;
  remoteArtifactId: string;
  contentHash?: string;
}): void {
  cleanupPath(resolvePreviewCachePath(input));
}
