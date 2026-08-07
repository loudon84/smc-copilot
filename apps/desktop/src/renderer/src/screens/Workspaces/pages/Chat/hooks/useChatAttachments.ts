import { useCallback, useState } from "react";
import type { ChatAttachmentMeta } from "../../../../../../../shared/workspace-chat/workspace-chat-contract";

export function useChatAttachments(
  profileId: string | null,
  workspaceId: string | null,
  sessionId: string,
): {
  attachments: ChatAttachmentMeta[];
  upload: () => Promise<void>;
  uploadFiles: (files: FileList) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => void;
} {
  const [attachments, setAttachments] = useState<ChatAttachmentMeta[]>([]);

  const upload = useCallback(async () => {
    if (!profileId || !workspaceId) return;
    const res = await window.workspaceChat.uploadAttachments({
      profile_id: profileId,
      workspace_id: workspaceId,
      session_id: sessionId,
    });
    setAttachments((prev) => [...prev, ...res.attachments]);
  }, [profileId, workspaceId, sessionId]);

  const remove = useCallback(
    async (id: string) => {
      if (!workspaceId) return;
      await window.workspaceChat.removeAttachment(workspaceId, id);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    },
    [workspaceId],
  );

  const uploadFiles = useCallback(
    async (files: FileList) => {
      if (!profileId || !workspaceId || files.length === 0) return;
      const res = await window.workspaceChat.uploadDroppedAttachments(
        {
          profile_id: profileId,
          workspace_id: workspaceId,
          session_id: sessionId,
        },
        files,
      );
      setAttachments((prev) => [...prev, ...res.attachments]);
    },
    [profileId, workspaceId, sessionId],
  );

  const clear = useCallback(() => setAttachments([]), []);

  return { attachments, upload, uploadFiles, remove, clear };
}

export type UseChatAttachmentsReturn = ReturnType<typeof useChatAttachments>;
