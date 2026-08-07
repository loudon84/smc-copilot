import type { CopilotServeHttpConfig } from "./http-client";

export interface SseMessage {
  id?: string;
  event?: string;
  data: Record<string, unknown>;
}

function parseSseBlock(block: string): SseMessage | null {
  const lines = block.split("\n");
  let id: string | undefined;
  let event: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("id:")) id = line.slice(3).trim();
    else if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }

  if (dataLines.length === 0) return null;
  try {
    const data = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
    return { id, event, data };
  } catch {
    return null;
  }
}

export async function subscribeSse(
  config: CopilotServeHttpConfig,
  path: string,
  onMessage: (msg: SseMessage) => void,
  signal: AbortSignal,
  lastEventId?: string,
): Promise<void> {
  // Phase 1: SSE still uses Renderer fetch without token. Full Main SSE multiplexer is Phase 3.
  // Prefer unpaired/local-dev endpoints or migrate TaskWorkbench to Main stream IPC later.
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  if (lastEventId) headers["Last-Event-ID"] = lastEventId;

  const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}${path}`, { headers, signal });
  if (!res.ok || !res.body) {
    throw new Error(`SSE failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const msg = parseSseBlock(part.trim());
      if (msg) onMessage(msg);
    }
  }
}
