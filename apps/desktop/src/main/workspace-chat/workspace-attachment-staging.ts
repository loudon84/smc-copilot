import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { dialog } from "electron";
import type { UploadWorkspaceAttachmentBuffer } from "../../shared/workspace-chat/workspace-chat-contract";
import { uploadAttachmentsMultipart } from "./workspace-chat-client";

export async function pickAndUploadAttachments(input: {
  profile_id: string;
  workspace_id: string;
  session_id: string;
  file_paths?: string[];
}) {
  let paths = input.file_paths ?? [];
  if (paths.length === 0) {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { attachments: [] };
    }
    paths = result.filePaths;
  }
  return uploadAttachmentsMultipart(
    input.workspace_id,
    input.profile_id,
    input.session_id,
    paths,
  );
}

export async function uploadAttachmentsFromBuffers(input: {
  profile_id: string;
  workspace_id: string;
  session_id: string;
  files: UploadWorkspaceAttachmentBuffer[];
}) {
  if (input.files.length === 0) {
    return { attachments: [] };
  }
  const tmpDir = await mkdtemp(join(tmpdir(), "workspace-chat-"));
  const paths: string[] = [];
  try {
    for (const file of input.files) {
      const safeName = basename(file.name) || "file";
      const filePath = join(tmpDir, safeName);
      await writeFile(filePath, Buffer.from(file.data));
      paths.push(filePath);
    }
    return await uploadAttachmentsMultipart(
      input.workspace_id,
      input.profile_id,
      input.session_id,
      paths,
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
