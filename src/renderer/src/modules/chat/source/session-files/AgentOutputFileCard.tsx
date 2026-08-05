/**
 * ManagedFile card for Session Files → Agent output (preview / save / open / reveal).
 * Distinct from the path-only card in components/files/message/AgentOutputFileCard.
 */

import { useState } from "react";
import {
  Eye,
  Download,
  ExternalLink,
  FolderOpen,
  FileWarning,
} from "lucide-react";
import type { ManagedFileView } from "@shared/chat-files";
import { FileIcon } from "../../../components/files/common/FileIcon";
import { formatFileSize } from "../../../components/files/composer/file-card-utils";

export interface AgentOutputFileCardProps {
  file: ManagedFileView;
  profile?: string;
  onPreview?: (fileId: string) => void;
}

function categoryLabel(file: ManagedFileView): string {
  const cat = file.category;
  if (cat === "markdown") return "Markdown";
  if (cat === "text") return "Text";
  if (cat === "html") return "HTML";
  if (cat === "pdf") return "PDF";
  if (cat === "image") return "Image";
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

/** Session Files Agent Output card with Preview / Save As / Open / Reveal. */
// @lat: [[session-file-context#Agent Output Section]]
export function AgentOutputFileCard({
  file,
  profile,
  onPreview,
}: AgentOutputFileCardProps): React.JSX.Element {
  const [busy, setBusy] = useState<string | null>(null);
  const missing = file.status === "missing" || file.status === "deleted";
  const sizeLabel = formatFileSize(file.size);
  const meta = [categoryLabel(file), sizeLabel].filter(Boolean).join(" · ");

  const run = async (key: string, fn: () => Promise<unknown>): Promise<void> => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } catch {
      /* best-effort UI actions */
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={`agent-output-managed-card${
        missing ? " agent-output-managed-card-missing" : ""
      }`}
      title={file.name}
    >
      <button
        type="button"
        className="agent-output-managed-card-main"
        onClick={() => {
          if (!missing) onPreview?.(file.id);
        }}
        disabled={missing}
      >
        <span className="agent-output-managed-card-icon">
          {missing ? (
            <FileWarning size={18} aria-hidden />
          ) : (
            <FileIcon category={file.category} name={file.name} size={18} />
          )}
        </span>
        <span className="agent-output-managed-card-body">
          <span className="agent-output-managed-card-name">{file.name}</span>
          <span className="agent-output-managed-card-meta">
            {missing ? "File missing" : meta || "Generated"}
          </span>
        </span>
      </button>
      <div className="agent-output-managed-card-actions">
        {onPreview && !missing && (
          <button
            type="button"
            className="agent-output-managed-card-action"
            title="Preview"
            aria-label={`Preview ${file.name}`}
            disabled={!!busy}
            onClick={() => onPreview(file.id)}
          >
            <Eye size={13} />
          </button>
        )}
        {!missing && (
          <button
            type="button"
            className="agent-output-managed-card-action"
            title="Save As…"
            aria-label={`Save ${file.name} as`}
            disabled={!!busy}
            onClick={() =>
              void run("saveAs", () =>
                window.hermesAPI.files.saveAs(profile, file.id),
              )
            }
          >
            <Download size={13} />
          </button>
        )}
        {!missing && (
          <button
            type="button"
            className="agent-output-managed-card-action"
            title="Open"
            aria-label={`Open ${file.name}`}
            disabled={!!busy}
            onClick={() =>
              void run("open", () =>
                window.hermesAPI.files.openExternal(profile, file.id),
              )
            }
          >
            <ExternalLink size={13} />
          </button>
        )}
        {!missing && (
          <button
            type="button"
            className="agent-output-managed-card-action"
            title="Reveal in folder"
            aria-label={`Reveal ${file.name}`}
            disabled={!!busy}
            onClick={() =>
              void run("reveal", () =>
                window.hermesAPI.files.revealInFolder(profile, file.id),
              )
            }
          >
            <FolderOpen size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

export default AgentOutputFileCard;
