/**
 * Session Files → Agent output section listing ManagedFile agent-output rows.
 */

import type { ManagedFileView } from "../../../../../shared/files";
import { AgentOutputEmptyState } from "./AgentOutputEmptyState";
import { AgentOutputFileCard } from "./AgentOutputFileCard";

export interface AgentOutputSectionProps {
  files: ManagedFileView[];
  profile?: string;
  onPreview?: (fileId: string) => void;
}

/** Agent output block in Session Files with dedicated action cards. */
// @lat: [[session-file-context#Agent Output Section]]
export function AgentOutputSection({
  files,
  profile,
  onPreview,
}: AgentOutputSectionProps): React.JSX.Element {
  return (
    <div className="session-files-section">
      <div className="session-files-section-title">Agent output</div>
      {files.length === 0 ? (
        <AgentOutputEmptyState />
      ) : (
        <div className="session-files-list agent-output-managed-list">
          {files.map((file) => (
            <AgentOutputFileCard
              key={`${file.id}-${file.ordinal ?? 0}`}
              file={file}
              profile={profile}
              onPreview={onPreview}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default AgentOutputSection;
