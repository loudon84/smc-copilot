import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import Database from "better-sqlite3";
import { getProfile, insertSharedContext, deleteSharedContext, insertAuditEvent, generateId } from "./profile-runtime-db";
import { profileHome } from "./config-importer";
import type { ShareSessionContextRequest, ShareSessionContextResult, ShareMode } from "../shared/profile-runtime/profile-runtime-contract";
import { ProfileRuntimeError } from "../shared/profile-runtime/profile-runtime-errors";

interface SessionData {
  id: string;
  title: string | null;
  model: string;
  messages: Array<{ role: string; content: string; timestamp: number }>;
}

function readSessionData(profileName: string, sessionId: string): SessionData | null {
  const home = profileHome(profileName);
  const dbPath = join(home, "state.db");
  if (!existsSync(dbPath)) return null;

  const db = new Database(dbPath, { readonly: true });
  try {
    const session = db.prepare("SELECT id, title, model FROM sessions WHERE id = ?").get(sessionId) as { id: string; title: string | null; model: string } | undefined;
    if (!session) return null;

    const messages = db.prepare(
      "SELECT role, content, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp ASC",
    ).all(sessionId) as Array<{ role: string; content: string; timestamp: number }>;

    return { id: session.id, title: session.title, model: session.model, messages };
  } finally {
    db.close();
  }
}

function generateContextMd(
  data: SessionData,
  sourceProfileId: string,
  targetProfileId: string,
  mode: ShareMode,
  maxChars?: number,
): string {
  const header = [
    "---",
    `id: ctx_${sourceProfileId}_${data.id}_${Date.now()}`,
    `sourceProfile: ${sourceProfileId}`,
    `sourceSessionId: ${data.id}`,
    `targetProfile: ${targetProfileId}`,
    `mode: ${mode}`,
    `createdAt: ${new Date().toISOString()}`,
    `messageCount: ${data.messages.length}`,
    "---",
    "",
    "# Shared Session Context",
    "",
    "## Source",
    "",
    `Profile: ${sourceProfileId}`,
    `Session: ${data.id}`,
    data.title ? `Title: ${data.title}` : "",
    "",
  ].filter(Boolean).join("\n");

  let body = "";

  if (mode === "snapshot") {
    body = "\n## Snapshot\n\n";
    for (const msg of data.messages) {
      body += `**${msg.role}** (${new Date(msg.timestamp).toISOString()}):\n${msg.content}\n\n`;
    }
  } else if (mode === "summary") {
    body = "\n## Summary\n\n";
    const userMessages = data.messages.filter((m) => m.role === "user");
    const assistantMessages = data.messages.filter((m) => m.role === "assistant");
    body += `### User Intents (${userMessages.length} messages)\n`;
    for (const msg of userMessages.slice(0, 10)) {
      body += `- ${msg.content.slice(0, 200)}\n`;
    }
    body += `\n### Key Conclusions (${assistantMessages.length} responses)\n`;
    for (const msg of assistantMessages.slice(-5)) {
      body += `- ${msg.content.slice(0, 300)}\n`;
    }
  } else {
    body = "\n## Full History\n\n";
    for (const msg of data.messages) {
      body += `### ${msg.role} — ${new Date(msg.timestamp).toISOString()}\n\n${msg.content}\n\n---\n\n`;
    }
  }

  let content = header + body;
  if (maxChars && content.length > maxChars) {
    content = content.slice(0, maxChars) + "\n\n[... truncated at ${maxChars} characters]";
  }

  return content;
}

export function shareSessionContext(request: ShareSessionContextRequest): ShareSessionContextResult[] {
  const sourceProfile = getProfile(request.sourceProfileId);
  if (!sourceProfile) throw new ProfileRuntimeError("PROFILE_NOT_FOUND", request.sourceProfileId);

  const sessionData = readSessionData(sourceProfile.name, request.sourceSessionId);
  if (!sessionData) {
    throw new ProfileRuntimeError("PROFILE_CONTEXT_SOURCE_SESSION_NOT_FOUND", request.sourceSessionId);
  }

  const results: ShareSessionContextResult[] = [];

  for (const targetProfileId of request.targetProfileIds) {
    const targetProfile = getProfile(targetProfileId);
    if (!targetProfile) {
      results.push({
        ok: false,
        sourceProfileId: request.sourceProfileId,
        sourceSessionId: request.sourceSessionId,
        targetProfileId,
        contextFilePath: "",
        errorCode: "PROFILE_NOT_FOUND",
        message: `Target profile not found: ${targetProfileId}`,
      });
      continue;
    }

    const targetHome = profileHome(targetProfile.name);
    const ctxDir = join(targetHome, "desktop", "shared-context", sourceProfile.name);
    mkdirSync(ctxDir, { recursive: true });

    const contextFileName = `${request.sourceSessionId}.md`;
    const contextFilePath = join(ctxDir, contextFileName);

    try {
      const content = generateContextMd(
        sessionData,
        sourceProfile.name,
        targetProfile.name,
        request.mode,
        request.maxChars,
      );

      writeFileSync(contextFilePath, content, "utf-8");

      const checksum = createHash("sha256").update(content).digest("hex");

      insertSharedContext({
        id: generateId(),
        source_profile_id: request.sourceProfileId,
        source_session_id: request.sourceSessionId,
        target_profile_id: targetProfileId,
        mode: request.mode,
        title: request.title ?? sessionData.title,
        summary: sessionData.messages.length > 0 ? sessionData.messages[0].content.slice(0, 200) : null,
        context_file_path: contextFilePath,
        message_count: sessionData.messages.length,
        max_chars: request.maxChars ?? null,
        checksum,
        status: "active",
      });

      insertAuditEvent({
        id: generateId(),
        event_type: "session_share",
        profile_id: request.sourceProfileId,
        source: "system",
        action: "share_session_context",
        payload_json: JSON.stringify({ target: targetProfileId, sessionId: request.sourceSessionId, mode: request.mode }),
        status: "success",
        error_message: null,
      });

      results.push({
        ok: true,
        sourceProfileId: request.sourceProfileId,
        sourceSessionId: request.sourceSessionId,
        targetProfileId,
        contextFilePath,
      });
    } catch (e) {
      if (existsSync(contextFilePath)) {
        try { const { unlinkSync } = require("fs"); unlinkSync(contextFilePath); } catch { /* ignore */ }
      }

      results.push({
        ok: false,
        sourceProfileId: request.sourceProfileId,
        sourceSessionId: request.sourceSessionId,
        targetProfileId,
        contextFilePath: "",
        errorCode: "PROFILE_CONTEXT_SHARE_FAILED",
        message: String(e),
      });
    }
  }

  return results;
}
