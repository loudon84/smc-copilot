import { useCallback, useState } from "react";
import { Eye, FilePlus2, Download, Check, Loader2 } from "lucide-react";
import type { MessageDocumentPreviewInput } from "../../../../../shared/files";
import { extractDocumentTitle } from "./document-message-utils";
import { formatDocumentActionError } from "./document-action-errors";

export interface MessageDocumentActionsProps {
  profile?: string;
  sessionId?: string | null;
  messageId: string;
  content: string;
  suggestedTitle?: string;
  sessionTitle?: string;
  /** True when this message already has an agent-output association. */
  alreadyInSession?: boolean;
  onPreview(input: MessageDocumentPreviewInput): void;
  onFileCreated(fileId: string): void;
}

type ActionState = "idle" | "creating" | "created" | "error";

/**
 * Action bar for document-like Assistant Messages: preview, save as .md,
 * and add to Session Files / Agent output.
 */
// @lat: [[file-ui-components#Message document actions]]
export function MessageDocumentActions({
  profile,
  sessionId,
  messageId,
  content,
  suggestedTitle,
  sessionTitle,
  alreadyInSession = false,
  onPreview,
  onFileCreated,
}: MessageDocumentActionsProps): React.JSX.Element {
  const [state, setState] = useState<ActionState>(
    alreadyInSession ? "created" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const busy = state === "creating";
  const canCreate = !!sessionId?.trim();

  const title = extractDocumentTitle(content, suggestedTitle, sessionTitle);

  const handlePreview = useCallback(() => {
    onPreview({
      sessionId: sessionId?.trim() || "",
      messageId,
      title,
      content,
    });
  }, [onPreview, sessionId, messageId, title, content]);

  const createFile = useCallback(
    async (thenSaveAs: boolean) => {
      if (busy || !canCreate || !sessionId) return;
      setState("creating");
      setError(null);
      try {
        const result = await window.hermesAPI.files.createFromMessage({
          profile,
          sessionId,
          messageId,
          title,
          content,
          extension: "md",
        });
        setState("created");
        onFileCreated(result.file.id);
        if (thenSaveAs) {
          await window.hermesAPI.files.saveAs(profile, result.file.id);
        }
      } catch (err) {
        setState("error");
        setError(formatDocumentActionError(err));
      }
    },
    [
      busy,
      canCreate,
      profile,
      sessionId,
      messageId,
      title,
      content,
      onFileCreated,
    ],
  );

  return (
    <div className="message-document-actions">
      <div className="message-document-actions-bar">
        <button
          type="button"
          className="message-document-action-btn"
          onClick={handlePreview}
          disabled={busy}
          title="Preview document"
        >
          <Eye size={13} />
          Preview
        </button>
        <button
          type="button"
          className="message-document-action-btn"
          onClick={() => void createFile(true)}
          disabled={busy || !canCreate}
          title={
            canCreate
              ? "Save as Markdown"
              : "Start a session before saving this report"
          }
        >
          {busy ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
          Save as .md
        </button>
        <button
          type="button"
          className="message-document-action-btn"
          onClick={() => void createFile(false)}
          disabled={busy || !canCreate || state === "created"}
          title={
            state === "created"
              ? "Already in Agent Output"
              : canCreate
                ? "Add to session files"
                : "Start a session before adding to Agent Output"
          }
        >
          {state === "created" ? (
            <>
              <Check size={13} />
              Added to Agent Output
            </>
          ) : (
            <>
              {busy ? (
                <Loader2 size={13} className="spin" />
              ) : (
                <FilePlus2 size={13} />
              )}
              Add to session files
            </>
          )}
        </button>
      </div>
      {error && (
        <div className="message-document-actions-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export default MessageDocumentActions;
