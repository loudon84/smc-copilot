/**
 * Chat-side Expert artifact cards: discovery state + File Platform resource actions.
 * Does not own metadata — reads ManagedFileView / projection file ids only.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Download,
  Eye,
  BookmarkPlus,
  Loader2,
  AlertCircle,
  Check,
} from "lucide-react";
import type { ExpertRunProjection } from "../../../../shared/expert";
import type { ManagedFileView } from "../../../../shared/files";

export interface ExpertArtifactCardsProps {
  projection: ExpertRunProjection;
  profile?: string;
  sessionId?: string | null;
  onPreview?: (fileId: string) => void;
}

function formatSize(size: number): string {
  if (!size || size < 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function availabilityLabel(file: ManagedFileView): string | null {
  switch (file.availability) {
    case "forbidden":
      return "Forbidden";
    case "not-found":
      return "Not found";
    case "unavailable":
      return "Unavailable";
    default:
      return null;
  }
}

/** Discovery + per-artifact actions under an Expert assistant result. */
export function ExpertArtifactCards({
  projection,
  profile,
  sessionId,
  onPreview,
}: ExpertArtifactCardsProps): React.JSX.Element | null {
  const [files, setFiles] = useState<ManagedFileView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [contextAdded, setContextAdded] = useState<Set<string>>(new Set());

  const loadFiles = useCallback(async () => {
    if (projection.artifactFileIds.length === 0) {
      setFiles([]);
      return;
    }
    const rows: ManagedFileView[] = [];
    for (const id of projection.artifactFileIds) {
      try {
        const file = await window.hermesAPI.files.getFile(profile, id);
        if (file) rows.push(file);
      } catch {
        /* skip missing */
      }
    }
    setFiles(rows);
  }, [profile, projection.artifactFileIds]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    const api = window.hermesAPI?.files;
    if (!api?.onFileDomainEvent || !sessionId) return;
    return api.onFileDomainEvent((event) => {
      if (
        event.type === "file:association-created" ||
        event.type === "file:created" ||
        event.type === "file:updated"
      ) {
        void loadFiles();
      }
    });
  }, [sessionId, loadFiles]);

  const run = async (key: string, fn: () => Promise<unknown>): Promise<void> => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const handleRetryDiscovery = (): void => {
    void run("retry", () =>
      window.hermesAPI.expert.retryArtifactDiscovery({
        clientRequestId: projection.clientRequestId,
      }),
    );
  };

  if (
    projection.artifactDiscovery === "idle" &&
    projection.artifactFileIds.length === 0
  ) {
    return null;
  }

  return (
    <div
      className="expert-artifact-cards"
      data-testid="expert-artifact-cards"
      data-discovery={projection.artifactDiscovery}
    >
      {projection.artifactDiscovery === "loading" ? (
        <div className="expert-artifact-discovery" role="status">
          <Loader2 size={14} className="expert-artifact-spin" />
          <span>Loading artifacts…</span>
        </div>
      ) : null}
      {projection.artifactDiscovery === "error" ? (
        <div className="expert-artifact-discovery expert-artifact-discovery-error">
          <AlertCircle size={14} />
          <span>
            {projection.artifactDiscoveryError || "Artifact discovery failed"}
          </span>
          <button type="button" onClick={handleRetryDiscovery} disabled={!!busy}>
            Retry
          </button>
        </div>
      ) : null}
      {files.map((file) => {
        const avail = availabilityLabel(file);
        const previewDisabled =
          file.canPreview === false ||
          file.availability === "forbidden" ||
          file.availability === "not-found";
        const inContext = contextAdded.has(file.id);
        return (
          <div
            key={file.id}
            className="expert-artifact-card"
            data-file-id={file.id}
          >
            <div className="expert-artifact-card-body">
              <div className="expert-artifact-card-name">{file.name}</div>
              <div className="expert-artifact-card-meta">
                {[file.category, formatSize(file.size), avail]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <div className="expert-artifact-card-actions">
              <span className="expert-artifact-added" title="Added to session">
                <Check size={12} /> Added
              </span>
              <button
                type="button"
                title="Preview"
                aria-label={`Preview ${file.name}`}
                disabled={previewDisabled || !!busy}
                onClick={() => onPreview?.(file.id)}
              >
                <Eye size={13} />
              </button>
              <button
                type="button"
                title="Download"
                aria-label={`Download ${file.name}`}
                disabled={
                  !!busy ||
                  file.availability === "forbidden" ||
                  file.availability === "not-found"
                }
                onClick={() =>
                  void run(`dl-${file.id}`, () =>
                    window.hermesAPI.files.saveAs(profile, file.id),
                  )
                }
              >
                <Download size={13} />
              </button>
              <button
                type="button"
                title={inContext ? "In context" : "Add to Context"}
                aria-label={`Add ${file.name} to context`}
                disabled={!!busy || !sessionId || inContext}
                onClick={() => {
                  if (!sessionId) return;
                  void run(`ctx-${file.id}`, async () => {
                    await window.hermesAPI.files.addToSessionContext({
                      profile,
                      sessionId,
                      fileId: file.id,
                    });
                    setContextAdded((prev) => new Set(prev).add(file.id));
                  });
                }}
              >
                <BookmarkPlus size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ExpertArtifactCards;
