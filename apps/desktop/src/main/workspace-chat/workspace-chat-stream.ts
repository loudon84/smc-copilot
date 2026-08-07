import { randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import type { BrowserWindow } from "electron";
import type {
  WorkspaceChatChunkEvent,
  WorkspaceChatDoneEvent,
  WorkspaceChatErrorEvent,
  WorkspaceChatSendPayload,
  WorkspaceChatToolProgressEvent,
  WorkspaceChatUsageEvent,
} from "../../shared/workspace-chat/workspace-chat-contract";
import {
  abortChatStream,
  chatCompletionsHeaders,
  chatCompletionsUrl,
} from "./workspace-chat-client";

type ActiveStream = {
  abort: () => void;
  streamId: string;
};

const activeStreams = new Map<string, ActiveStream>();

function streamKey(profileId: string, sessionId: string): string {
  return `${profileId}:${sessionId}`;
}

function parseSseBlock(block: string, win: BrowserWindow): void {
  let eventName = "";
  let dataLine = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) {
      eventName = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      dataLine = line.slice(6);
    }
  }
  if (!dataLine) return;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(dataLine) as Record<string, unknown>;
  } catch {
    return;
  }

  if (eventName === "chat.chunk") {
    win.webContents.send("workspace-chat:chunk", data as WorkspaceChatChunkEvent);
    return;
  }
  if (eventName === "chat.tool_progress") {
    win.webContents.send(
      "workspace-chat:tool-progress",
      data as WorkspaceChatToolProgressEvent,
    );
    return;
  }
  if (eventName === "chat.usage") {
    win.webContents.send("workspace-chat:usage", data as WorkspaceChatUsageEvent);
    return;
  }
  if (eventName === "chat.done") {
    win.webContents.send("workspace-chat:done", data as WorkspaceChatDoneEvent);
    return;
  }
  if (eventName === "chat.error") {
    win.webContents.send("workspace-chat:error", data as WorkspaceChatErrorEvent);
  }
}

export async function startWorkspaceChatStream(
  win: BrowserWindow,
  payload: WorkspaceChatSendPayload,
): Promise<{ stream_id: string }> {
  const key = streamKey(payload.profile_id, payload.session_id);
  const existing = activeStreams.get(key);
  if (existing) {
    existing.abort();
    activeStreams.delete(key);
  }

  const streamId = payload.stream_id ?? `stream_${randomUUID()}`;
  const body = {
    workspace_id: payload.workspace_id,
    session_id: payload.session_id,
    stream_id: streamId,
    model: payload.model ?? undefined,
    messages: payload.messages,
    attachments: payload.attachments ?? [],
    stream: true,
  };

  const url = new URL(chatCompletionsUrl(payload.profile_id));
  const headers = chatCompletionsHeaders();
  const requester = url.protocol === "https:" ? https.request : http.request;

  await new Promise<void>((resolve, reject) => {
    const req = requester(
      url,
      {
        method: "POST",
        headers,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          let errBody = "";
          res.on("data", (d) => {
            errBody += d.toString();
          });
          res.on("end", () => {
            win.webContents.send("workspace-chat:error", {
              stream_id: streamId,
              profile_id: payload.profile_id,
              workspace_id: payload.workspace_id,
              session_id: payload.session_id,
              message: errBody.slice(0, 500) || `HTTP ${res.statusCode}`,
            } satisfies WorkspaceChatErrorEvent);
            activeStreams.delete(key);
            resolve();
          });
          return;
        }

        let buffer = "";
        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            if (part.trim()) {
              parseSseBlock(part, win);
            }
          }
        });
        res.on("end", () => {
          if (buffer.trim()) {
            parseSseBlock(buffer, win);
          }
          activeStreams.delete(key);
          resolve();
        });
      },
    );

    req.on("error", (err) => {
      win.webContents.send("workspace-chat:error", {
        stream_id: streamId,
        profile_id: payload.profile_id,
        workspace_id: payload.workspace_id,
        session_id: payload.session_id,
        message: String(err),
      } satisfies WorkspaceChatErrorEvent);
      activeStreams.delete(key);
      reject(err);
    });

    const abortFn = () => {
      req.destroy();
      void abortChatStream(payload.profile_id, streamId);
    };

    activeStreams.set(key, { abort: abortFn, streamId });

    req.write(JSON.stringify(body));
    req.end();
  });

  return { stream_id: streamId };
}

export function abortWorkspaceChatStream(profileId: string, sessionId?: string): void {
  if (sessionId) {
    const key = streamKey(profileId, sessionId);
    const entry = activeStreams.get(key);
    if (entry) {
      entry.abort();
      activeStreams.delete(key);
    }
    return;
  }

  const prefix = `${profileId}:`;
  for (const [key, entry] of activeStreams) {
    if (key.startsWith(prefix)) {
      entry.abort();
      activeStreams.delete(key);
    }
  }
}
