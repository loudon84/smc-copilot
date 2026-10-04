import { readFileSync } from "fs";
import {
  createAuthorizedBackendTransport,
  AuthorizedBackendTransportError,
} from "../auth/authorized-backend-transport";
import { getManagedFile, normalizeProfileId } from "../files/file-association-store";
import { materializeRemoteExpertArtifact } from "../files/materialize-remote-expert-artifact";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";

const ATTACHMENT_REF = /^att_[A-Za-z0-9._-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export interface PreparedAttachmentLink {
  type: "resource_link";
  uri: string;
  name: string;
}

export async function prepareAttachmentResourceLinks(input: {
  profileId: string;
  fileIds: string[];
}): Promise<PreparedAttachmentLink[]> {
  if (input.fileIds.length === 0) return [];
  const links: PreparedAttachmentLink[] = [];
  for (const fileId of input.fileIds) {
    const file = getManagedFile(normalizeProfileId(input.profileId), fileId);
    if (!file) {
      throw new RemoteExpertError("REMOTE_ATTACHMENT_PROOF_FAILED", "managed file missing");
    }
    let path = file.managedPath;
    if (file.locality === "remote" || !path) {
      const materialized = await materializeRemoteExpertArtifact(input.profileId, fileId);
      path = materialized.managedPath;
    }
    if (!path) {
      throw new RemoteExpertError("REMOTE_ATTACHMENT_PROOF_FAILED", "file has no local bytes");
    }
    const bytes = readFileSync(path);
    const ref = await uploadAttachmentBytes({
      filename: file.name,
      bytes,
      contentType: file.mime || "application/octet-stream",
    });
    links.push({
      type: "resource_link",
      uri: `nodeskclaw://attachment/${ref}`,
      name: file.name,
    });
  }
  return links;
}

export async function uploadAttachmentBytes(input: {
  filename: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<string> {
  const transport = createAuthorizedBackendTransport();
  try {
    return await transport.withAuthRetry(async () => {
      const form = new FormData();
      const blob = new Blob([new Uint8Array(input.bytes)], { type: input.contentType });
      form.append("file", blob, input.filename);
      const res = await transport.authorizedFetch("/api/v1/attachments", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        throw new AuthorizedBackendTransportError(`upload ${res.status}`, {
          status: res.status,
        });
      }
      const body = (await res.json()) as unknown;
      const ref = isRecord(body)
        ? String(body.attachment_ref ?? body.attachmentRef ?? "")
        : "";
      if (!ATTACHMENT_REF.test(ref)) {
        throw new RemoteExpertError(
          "REMOTE_ATTACHMENT_UPLOAD_FAILED",
          "invalid attachment_ref",
        );
      }
      return ref;
    });
  } catch (err) {
    if (err instanceof RemoteExpertError) throw err;
    throw new RemoteExpertError("REMOTE_ATTACHMENT_UPLOAD_FAILED", "attachment upload failed");
  }
}

export function buildPromptBlocks(
  text: string,
  links: PreparedAttachmentLink[],
): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  if (text.trim()) blocks.push({ type: "text", text });
  for (const link of links) blocks.push(link);
  return blocks;
}
