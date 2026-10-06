import { readFileSync } from "fs";
import {
  AuthorizedBackendTransportError,
  createAuthorizedBackendTransport,
} from "../auth/authorized-backend-transport";
import { getManagedFile, normalizeProfileId } from "../files/file-association-store";
import { materializeRemoteExpertArtifact } from "../files/materialize-remote-expert-artifact";
import {
  ATTACHMENT_REF_RE,
  RemoteExpertError,
  type RemoteAttachmentReceipt,
} from "../../shared/remote-expert";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export type PromptBlock =
  | { type: "text"; text: string }
  | { type: "resource_link"; uri: string; name: string };

const FORBIDDEN_URI = /^(file:|https?:|ftp:|[A-Za-z]:\\|\/)/i;

export function assertPromptBlocksSafe(blocks: PromptBlock[]): void {
  for (const block of blocks) {
    if (block.type !== "resource_link") continue;
    if (FORBIDDEN_URI.test(block.uri) || !block.uri.startsWith("nodeskclaw://attachment/")) {
      throw new RemoteExpertError(
        "REMOTE_EXPERT_RESOURCE_DENIED",
        "illegal ACP ResourceLink",
      );
    }
  }
}

function parseReceipt(body: unknown): RemoteAttachmentReceipt {
  if (!isRecord(body)) {
    throw new RemoteExpertError("ATTACHMENT_REF_INVALID", "receipt invalid");
  }
  const errorCode = body.error_code;
  if (typeof errorCode === "string") {
    throw new RemoteExpertError(errorCode, String(body.message ?? errorCode));
  }
  const receipt: RemoteAttachmentReceipt = {
    attachment_ref: String(body.attachment_ref ?? ""),
    name: String(body.name ?? ""),
    size_bytes: Number(body.size_bytes ?? 0),
    checksum_sha256: String(body.checksum_sha256 ?? ""),
    content_type: String(body.content_type ?? ""),
    expires_at: String(body.expires_at ?? ""),
  };
  if (!ATTACHMENT_REF_RE.test(receipt.attachment_ref)) {
    throw new RemoteExpertError(
      "ATTACHMENT_REF_INVALID",
      "attachment_ref shape invalid",
    );
  }
  if (receipt.expires_at) {
    const exp = Date.parse(receipt.expires_at);
    if (Number.isFinite(exp) && exp <= Date.now()) {
      throw new RemoteExpertError("ATTACHMENT_EXPIRED", "attachment expired");
    }
  }
  return receipt;
}

export async function uploadAttachmentBytes(input: {
  filename: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<RemoteAttachmentReceipt> {
  const transport = createAuthorizedBackendTransport();
  try {
    return await transport.withAuthRetry(async () => {
      const form = new FormData();
      const blob = new Blob([new Uint8Array(input.bytes)], {
        type: input.contentType,
      });
      form.append("file", blob, input.filename);
      const res = await transport.authorizedFetch("/api/v1/attachments", {
        method: "POST",
        body: form,
      });
      const body = (await res.json()) as unknown;
      if (!res.ok) {
        if (isRecord(body) && typeof body.error_code === "string") {
          throw new RemoteExpertError(
            body.error_code,
            String(body.message ?? body.error_code),
          );
        }
        throw new AuthorizedBackendTransportError(`upload ${res.status}`, {
          status: res.status,
        });
      }
      return parseReceipt(body);
    });
  } catch (err) {
    if (err instanceof RemoteExpertError) throw err;
    throw new RemoteExpertError(
      "REMOTE_ATTACHMENT_LOCAL_READ_FAILED",
      "attachment upload failed",
    );
  }
}

export async function prepareAttachmentResourceLinks(input: {
  profileId: string;
  fileIds: string[];
}): Promise<PromptBlock[]> {
  if (input.fileIds.length === 0) return [];
  const links: PromptBlock[] = [];
  for (const fileId of input.fileIds) {
    const file = getManagedFile(normalizeProfileId(input.profileId), fileId);
    if (!file) {
      throw new RemoteExpertError(
        "REMOTE_ATTACHMENT_LOCAL_READ_FAILED",
        "managed file missing",
      );
    }
    let path = file.managedPath;
    if (file.locality === "remote" || !path) {
      const materialized = await materializeRemoteExpertArtifact(
        input.profileId,
        fileId,
      );
      path = materialized.managedPath;
    }
    if (!path) {
      throw new RemoteExpertError(
        "REMOTE_ATTACHMENT_LOCAL_READ_FAILED",
        "file has no local bytes",
      );
    }
    let bytes: Buffer;
    try {
      bytes = readFileSync(path);
    } catch {
      throw new RemoteExpertError(
        "REMOTE_ATTACHMENT_LOCAL_READ_FAILED",
        "local read failed",
      );
    }
    const receipt = await uploadAttachmentBytes({
      filename: file.name,
      bytes,
      contentType: file.mime || "application/octet-stream",
    });
    links.push({
      type: "resource_link",
      uri: `nodeskclaw://attachment/${receipt.attachment_ref}`,
      name: file.name,
    });
  }
  assertPromptBlocksSafe(links);
  return links;
}

export function buildPromptBlocks(
  text: string,
  links: PromptBlock[],
): PromptBlock[] {
  const blocks: PromptBlock[] = [];
  if (text.trim()) blocks.push({ type: "text", text });
  blocks.push(...links);
  assertPromptBlocksSafe(blocks);
  return blocks;
}
