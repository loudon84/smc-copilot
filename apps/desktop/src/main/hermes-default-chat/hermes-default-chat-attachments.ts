import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { dialog } from "electron";
import type {
  HermesChatAttachmentBuffer,
  HermesChatAttachmentMeta,
  UploadHermesAttachmentBuffersPayload,
  UploadHermesAttachmentsPayload,
} from "../../shared/hermes-default-chat/hermes-default-chat-contract";
import { profileHome } from "../utils";
import { appendSkillParamsJsonBlock } from "./message-skill-params";

type AttachmentIndex = Record<string, HermesChatAttachmentMeta>;

function indexPath(profile?: string): string {
  return join(profileHome(profile), "desktop", "chat-attachments", "index.json");
}

function sessionDir(profile: string | undefined, sessionId: string): string {
  return join(profileHome(profile), "desktop", "chat-attachments", sessionId);
}

function profileKey(profile?: string): string {
  return profile?.trim() || "default";
}

async function readIndex(profile?: string): Promise<AttachmentIndex> {
  const path = indexPath(profile);
  if (!existsSync(path)) return {};
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as { attachments?: AttachmentIndex };
    return parsed.attachments ?? {};
  } catch {
    return {};
  }
}

async function writeIndex(profile: string | undefined, attachments: AttachmentIndex): Promise<void> {
  const path = indexPath(profile);
  await mkdir(join(profileHome(profile), "desktop", "chat-attachments"), { recursive: true });
  await writeFile(path, JSON.stringify({ attachments }, null, 2), "utf-8");
}

async function storeFile(
  profile: string | undefined,
  sessionId: string,
  sourcePath: string,
  displayName?: string,
): Promise<HermesChatAttachmentMeta> {
  const name = displayName ?? basename(sourcePath);
  const buf = await readFile(sourcePath);
  const id = randomUUID();
  const dir = sessionDir(profile, sessionId);
  await mkdir(dir, { recursive: true });
  const safeName = name.replace(/[^\w.\-()+@ ]/g, "_");
  const storagePath = join(dir, `${id}_${safeName}`);
  await writeFile(storagePath, buf);
  const mime = guessMime(name);
  const meta: HermesChatAttachmentMeta = {
    id,
    profile_id: profileKey(profile),
    session_id: sessionId,
    name,
    mime_type: mime,
    size_bytes: buf.length,
    storage_path: storagePath,
    text_preview:
      mime.startsWith("text/") || mime === "application/json"
        ? buf.toString("utf-8").slice(0, 4000)
        : null,
  };
  const index = await readIndex(profile);
  index[id] = meta;
  await writeIndex(profile, index);
  return meta;
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function formatAttachmentMeta(att: HermesChatAttachmentMeta): string {
  return `[AttachmentMetaJSON] ${JSON.stringify({
    name: att.name,
    path: att.storage_path,
    id: att.id,
    session_id: att.session_id,
    mime: att.mime_type,
  })}`;
}

function isTextLikeAttachment(mime: string): boolean {
  return mime.startsWith("text/") || mime === "application/json";
}

async function buildNonImageAttachmentBlock(att: HermesChatAttachmentMeta): Promise<string> {
  const meta = formatAttachmentMeta(att);
  if (!isTextLikeAttachment(att.mime_type)) {
    return `[File: ${att.name}]\n${meta}\n该附件已落盘至 Desktop chat-attachments；请从 [AttachmentMetaJSON] 读取 path，用 terminal + resolve_attachment_path.py / extract_text.py 处理，勿把 PDF/二进制当粘贴文本解析。`;
  }

  let preview = att.text_preview;
  if (!preview) {
    try {
      const buf = await readFile(att.storage_path);
      preview = buf.toString("utf-8").slice(0, 8000);
    } catch {
      preview = null;
    }
  }

  if (preview?.trim()) {
    return `[File: ${att.name}]\n${preview}\n${meta}`;
  }
  return `[File: ${att.name}]\n${meta}`;
}

export async function pickAndUploadHermesAttachments(
  payload: UploadHermesAttachmentsPayload,
): Promise<{ attachments: HermesChatAttachmentMeta[] }> {
  let paths = payload.file_paths ?? [];
  if (paths.length === 0) {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { attachments: [] };
    }
    paths = result.filePaths;
  }
  const out: HermesChatAttachmentMeta[] = [];
  for (const p of paths) {
    out.push(await storeFile(payload.profile, payload.session_id, p));
  }
  return { attachments: out };
}

export async function uploadHermesAttachmentsFromBuffers(
  payload: UploadHermesAttachmentBuffersPayload,
): Promise<{ attachments: HermesChatAttachmentMeta[] }> {
  if (payload.files.length === 0) return { attachments: [] };
  const out: HermesChatAttachmentMeta[] = [];
  for (const file of payload.files) {
    const safeName = basename(file.name) || "file";
    const dir = sessionDir(payload.profile, payload.session_id);
    await mkdir(dir, { recursive: true });
    const id = randomUUID();
    const storagePath = join(dir, `${id}_${safeName}`);
    const buf = Buffer.from(file.data);
    await writeFile(storagePath, buf);
    const mime = file.mime_type || guessMime(safeName);
    const meta: HermesChatAttachmentMeta = {
      id,
      profile_id: profileKey(payload.profile),
      session_id: payload.session_id,
      name: safeName,
      mime_type: mime,
      size_bytes: buf.length,
      storage_path: storagePath,
      text_preview:
        mime.startsWith("text/") || mime === "application/json"
          ? buf.toString("utf-8").slice(0, 4000)
          : null,
    };
    const index = await readIndex(payload.profile);
    index[id] = meta;
    await writeIndex(payload.profile, index);
    out.push(meta);
  }
  return { attachments: out };
}

export async function removeHermesAttachment(
  profile: string | undefined,
  attachmentId: string,
): Promise<void> {
  const index = await readIndex(profile);
  const meta = index[attachmentId];
  if (!meta) return;
  try {
    await rm(meta.storage_path, { force: true });
  } catch {
    /* ignore */
  }
  delete index[attachmentId];
  await writeIndex(profile, index);
}

export async function getHermesAttachmentsByIds(
  profile: string | undefined,
  attachmentIds: string[],
): Promise<HermesChatAttachmentMeta[]> {
  const index = await readIndex(profile);
  return attachmentIds.map((id) => index[id]).filter(Boolean);
}

/** Merge index.json lookup with upload-time metas from Renderer (index may lag). */
export async function resolveAttachmentMetas(
  profile: string | undefined,
  attachmentIds: string[],
  explicitMetas?: HermesChatAttachmentMeta[],
): Promise<HermesChatAttachmentMeta[]> {
  const explicitById = new Map((explicitMetas ?? []).map((m) => [m.id, m]));
  const fromIndex = attachmentIds.length
    ? await getHermesAttachmentsByIds(profile, attachmentIds)
    : [];
  const fromIndexById = new Map(fromIndex.map((m) => [m.id, m]));

  const ids = attachmentIds.length
    ? attachmentIds
    : (explicitMetas ?? []).map((m) => m.id);

  return ids
    .map((id) => fromIndexById.get(id) ?? explicitById.get(id))
    .filter((m): m is HermesChatAttachmentMeta => Boolean(m));
}

/** Build user message text + optional multimodal parts for OpenAI-compatible API. */
export async function buildUserMessageContent(
  message: string,
  profile: string | undefined,
  attachmentIds: string[],
  explicitMetas?: HermesChatAttachmentMeta[],
): Promise<string | Array<{ type: string; text?: string; image_url?: { url: string } }>> {
  const messageWithParams = appendSkillParamsJsonBlock(message);
  const trimmed = messageWithParams.trim();
  const metas = await resolveAttachmentMetas(profile, attachmentIds, explicitMetas);
  if (metas.length === 0) return trimmed;
  
  const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
  const textBlocks: string[] = [];

  for (const att of metas) {
    if (att.mime_type.startsWith("image/")) {
      const buf = await readFile(att.storage_path);
      const b64 = buf.toString("base64");
      parts.push({
        type: "image_url",
        image_url: { url: `data:${att.mime_type};base64,${b64}` },
      });
      textBlocks.push(await buildNonImageAttachmentBlock(att));
    } else {
      textBlocks.push(await buildNonImageAttachmentBlock(att));
    }
  }

  const combinedText = [trimmed, ...textBlocks].filter(Boolean).join("\n\n");
  if (parts.length === 0) {
    return combinedText || "(attachments)";
  }

  if (combinedText) {
    parts.unshift({ type: "text", text: combinedText });
  }
  return parts;
}
