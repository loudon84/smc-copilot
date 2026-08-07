/** Minimal SSE reader for Runtime event streams. */

export interface SseMessage {
  event: string | null;
  data: string;
  id: string | null;
}

export async function* readSseStream(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<SseMessage> {
  if (!response.body) {
    throw new Error("SSE response has no body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event: string | null = null;
  let dataLines: string[] = [];
  let id: string | null = null;

  const flush = (): SseMessage | null => {
    if (dataLines.length === 0 && event === null) return null;
    const msg: SseMessage = {
      event,
      data: dataLines.join("\n"),
      id,
    };
    event = null;
    dataLines = [];
    id = null;
    return msg;
  };

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? "";
      for (const line of parts) {
        if (line === "") {
          const msg = flush();
          if (msg) yield msg;
          continue;
        }
        if (line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        const rawValue = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "event") event = rawValue;
        else if (field === "data") dataLines.push(rawValue);
        else if (field === "id") id = rawValue;
      }
    }
    const trailing = flush();
    if (trailing) yield trailing;
  } finally {
    reader.releaseLock();
  }
}
