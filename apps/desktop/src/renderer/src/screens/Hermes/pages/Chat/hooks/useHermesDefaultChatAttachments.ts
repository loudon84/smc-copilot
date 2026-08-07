import { useCallback, useState } from "react";
import { hermesDefaultApi } from "../../../api/hermesDefaultApi";
import type { HermesChatAttachmentMeta } from "../../../../../../../shared/hermes-default-chat/hermes-default-chat-contract";

export function useHermesDefaultChatAttachments(sessionId: string): {
  attachments: HermesChatAttachmentMeta[];
  upload: () => Promise<void>;
  uploadFiles: (files: FileList) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => void;
} {
  const [attachments, setAttachments] = useState<HermesChatAttachmentMeta[]>([]);

  const upload = useCallback(async () => {
    const res = await hermesDefaultApi.chat.uploadAttachments({
      session_id: sessionId,
    });
    setAttachments((prev) => [...prev, ...res.attachments]);
  }, [sessionId]);

  const uploadFiles = useCallback(
    async (files: FileList) => {
      if (files.length === 0) return;
      const res = await hermesDefaultApi.chat.uploadDroppedAttachments(
        {
          session_id: sessionId,
        },
        files,
      );
      setAttachments((prev) => [...prev, ...res.attachments]);
    },
    [sessionId],
  );

  const remove = useCallback(async (id: string) => {
    await hermesDefaultApi.chat.removeAttachment("default", id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clear = useCallback(() => setAttachments([]), []);

  return { attachments, upload, uploadFiles, remove, clear };
}

export type UseHermesDefaultChatAttachmentsReturn = ReturnType<
  typeof useHermesDefaultChatAttachments
>;

